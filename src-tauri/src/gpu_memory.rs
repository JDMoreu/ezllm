//! System-wide dedicated GPU memory. DXGI supplies capacity and adapter LUID;
//! WDDM's GPU Adapter Memory counter supplies usage across ALL processes.
//! QueryVideoMemoryInfo and Vulkan budgets are process scoped, not this metric.
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuMemory {
    pub id: String,
    pub name: String,
    pub dedicated_total_bytes: u64,
    /// None means unavailable, never zero usage or a previous cached reading.
    pub dedicated_used_bytes: Option<u64>,
    pub source: &'static str,
}

#[cfg(any(windows, test))]
fn adapter_usage(id: &str, counters: &[(String, Option<u64>)]) -> Option<u64> {
    // An adapter may expose several physical nodes. Sum only its own nodes;
    // never merge by display name (two identical cards can have the same name).
    let prefix = format!("{}_phys_", id.to_ascii_lowercase());
    let mut total = None;
    for (name, value) in counters {
        let lower = name.to_ascii_lowercase();
        let Some(node) = lower.strip_prefix(&prefix) else {
            continue;
        };
        if node.is_empty() || !node.bytes().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let value = (*value)?;
        total = Some(total.unwrap_or(0u64).saturating_add(value));
    }
    total
}

#[cfg(windows)]
pub fn snapshot() -> Vec<GpuMemory> {
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE, IDXGIFactory1,
    };
    let counters = dedicated_counters();
    // Enumeration is cheap and also handles driver restarts and eGPU changes.
    let Ok(factory) = (unsafe { CreateDXGIFactory1::<IDXGIFactory1>() }) else {
        return vec![];
    };
    let mut devices = Vec::new();
    let mut index = 0;
    while let Ok(adapter) = unsafe { factory.EnumAdapters1(index) } {
        index += 1;
        let Ok(desc) = (unsafe { adapter.GetDesc1() }) else {
            continue;
        };
        if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
            continue;
        }
        let id = format!(
            "luid_0x{:08x}_0x{:08x}",
            desc.AdapterLuid.HighPart as u32, desc.AdapterLuid.LowPart
        );
        let end = desc
            .Description
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(desc.Description.len());
        devices.push(GpuMemory {
            dedicated_used_bytes: adapter_usage(&id, &counters),
            id,
            name: crate::hardware::clean_gpu_name(&String::from_utf16_lossy(
                &desc.Description[..end],
            )),
            dedicated_total_bytes: desc.DedicatedVideoMemory as u64,
            source: "Windows GPU Adapter Memory / DXGI",
        });
    }
    devices
}

#[cfg(not(windows))]
pub fn snapshot() -> Vec<GpuMemory> {
    vec![]
}

#[cfg(windows)]
fn dedicated_counters() -> Vec<(String, Option<u64>)> {
    use std::sync::Mutex;
    use windows_sys::Win32::System::Performance::*;
    // Handles remain alive for the life of the process; errors close and reset
    // the query, allowing recovery after a driver or performance service reset.
    static QUERY: Mutex<Option<(usize, usize)>> = Mutex::new(None);
    let Ok(mut guard) = QUERY.lock() else {
        return vec![];
    };
    unsafe {
        if guard.is_none() {
            let path: Vec<u16> = "\\GPU Adapter Memory(*)\\Dedicated Usage\0"
                .encode_utf16()
                .collect();
            let mut query: PDH_HQUERY = std::ptr::null_mut();
            let mut counter: PDH_HCOUNTER = std::ptr::null_mut();
            if PdhOpenQueryW(std::ptr::null(), 0, &mut query) != 0 {
                return vec![];
            }
            if PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) != 0 {
                PdhCloseQuery(query);
                return vec![];
            }
            *guard = Some((query as usize, counter as usize));
        }
        let (query, counter) = guard.unwrap();
        let query = query as PDH_HQUERY;
        let counter = counter as PDH_HCOUNTER;
        let read = || -> Option<Vec<(String, Option<u64>)>> {
            if PdhCollectQueryData(query) != 0 {
                return None;
            }
            // Size can change as adapters appear. Retry the sized allocation.
            for _ in 0..3 {
                let mut size = 0;
                let mut count = 0;
                if PdhGetFormattedCounterArrayW(
                    counter,
                    PDH_FMT_LARGE,
                    &mut size,
                    &mut count,
                    std::ptr::null_mut(),
                ) != PDH_MORE_DATA
                    || size == 0
                {
                    return None;
                }
                let item_size = std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>();
                let mut items = vec![
                    PDH_FMT_COUNTERVALUE_ITEM_W::default();
                    (size as usize).div_ceil(item_size)
                ];
                let status = PdhGetFormattedCounterArrayW(
                    counter,
                    PDH_FMT_LARGE,
                    &mut size,
                    &mut count,
                    items.as_mut_ptr(),
                );
                if status == PDH_MORE_DATA {
                    continue;
                }
                if status != 0 {
                    return None;
                }
                let mut result = Vec::new();
                for item in items.iter().take(count as usize) {
                    if item.szName.is_null() {
                        continue;
                    }
                    let mut len = 0;
                    while *item.szName.add(len) != 0 {
                        len += 1;
                    }
                    let name =
                        String::from_utf16_lossy(std::slice::from_raw_parts(item.szName, len));
                    let value = item.FmtValue.Anonymous.largeValue;
                    // PDH_CSTATUS_NEW_DATA (1) is valid as well as VALID_DATA (0).
                    let value = (item.FmtValue.CStatus <= 1 && value >= 0).then_some(value as u64);
                    result.push((name, value));
                }
                return Some(result);
            }
            None
        };
        match read() {
            Some(values) => values,
            None => {
                PdhCloseQuery(query);
                *guard = None;
                vec![]
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_adapter_identity_and_sums_nodes() {
        let counters = vec![
            (
                "luid_0x00000000_0xABCD1234_phys_0".into(),
                Some(5_000_000_000),
            ),
            ("luid_0x00000000_0xabcd1234_phys_1".into(), Some(1024)),
            ("luid_0x00000000_0xabcd12345_phys_0".into(), Some(999)),
            ("luid_0x00000000_0xabcd1234_phys_invalid".into(), Some(999)),
        ];
        assert_eq!(
            adapter_usage("luid_0x00000000_0xabcd1234", &counters),
            Some(5_000_001_024)
        );
        assert_eq!(adapter_usage("missing", &counters), None);
    }
    #[test]
    fn unavailable_node_is_not_zero_or_partial_usage() {
        assert_eq!(
            adapter_usage("gpu", &[("gpu_phys_0".into(), Some(0))]),
            Some(0)
        );
        assert_eq!(
            adapter_usage(
                "gpu",
                &[
                    ("gpu_phys_0".into(), Some(100)),
                    ("gpu_phys_1".into(), None)
                ]
            ),
            None
        );
    }
    #[test]
    #[cfg(windows)]
    #[ignore = "live Windows GPU probe"]
    fn live_gpu_memory() {
        let devices = snapshot();
        println!("{}", serde_json::to_string_pretty(&devices).unwrap());
        assert!(devices.iter().any(|d| d.dedicated_used_bytes.is_some()));
    }
}
