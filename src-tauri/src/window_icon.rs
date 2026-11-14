//! Icono grande de la ventana en Windows.
//!
//! Tauri solo asigna `ICON_SMALL` a la ventana. La barra de tareas pinta
//! `ICON_BIG` y, si falta, recurre a la caché de iconos del Explorador para
//! la ruta del `.exe`, que puede seguir mostrando un icono antiguo después de
//! recompilar. Aquí se carga el icono incrustado en el propio ejecutable
//! (recurso 32512, el que escribe `tauri-build`) y se asigna como `ICON_BIG`,
//! de modo que la barra de tareas siempre coincide con el icono compilado.

#[cfg(windows)]
pub fn apply<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, LoadImageW, SendMessageW, ICON_BIG, IMAGE_ICON, LR_DEFAULTCOLOR,
        SM_CXICON, SM_CYICON, WM_SETICON,
    };

    // Identificador del icono de la aplicación en `resource.rc`.
    const APP_ICON_ID: u16 = 32512;

    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    unsafe {
        let module = GetModuleHandleW(std::ptr::null());
        if module.is_null() {
            return;
        }
        let icon = LoadImageW(
            module,
            APP_ICON_ID as usize as *const u16,
            IMAGE_ICON,
            GetSystemMetrics(SM_CXICON),
            GetSystemMetrics(SM_CYICON),
            LR_DEFAULTCOLOR,
        );
        if icon.is_null() {
            return;
        }
        SendMessageW(hwnd.0 as _, WM_SETICON, ICON_BIG as usize, icon as isize);
    }
}

#[cfg(not(windows))]
pub fn apply<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>) {}
