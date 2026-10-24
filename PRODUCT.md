# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: Tauri 2 desktop shell with a React 19 + TypeScript UI, Tailwind CSS 4, Vite 8, and a Rust backend. The first target is Windows x86_64.

## Users

EzLLM serves two local llama.cpp users in the same desktop app. The technical user knows GGUF, quantizations, context, and GPU offload, and wants precise control without editing scripts. The newer user wants to download a model and run it without understanding every flag. Both own the machine and care about using their GPU and RAM well.

## Product Purpose

EzLLM is a local control panel for llama.cpp. It installs and manages runtimes, finds and downloads GGUF models, detects the real hardware, and starts `llama-server` with understandable, inspectable arguments. Success means a user can go from a fresh machine to a running local model without leaving the app, while retaining full control over the command line.

## Positioning

The product joins runtime installation, Hugging Face model discovery, hardware-aware memory guidance, and a searchable llama.cpp argument catalog in one local-first workflow. It does not hide the command line; it makes the command line legible and reproducible.

## Operating Context

The app is used on a personal Windows desktop, often while a model is downloading or a server is running. Users switch between short setup tasks and longer experimentation sessions, inspect telemetry, compare quantizations, and copy or adjust the generated `llama-server` command. Network access is required only for GitHub releases and Hugging Face; the local runtime and models stay on the machine.

## Capabilities and Constraints

- Install, select, and remove llama.cpp builds from official GitHub releases.
- Discover GGUF repositories and quantizations on Hugging Face, then download files into the configured models directory.
- Scan local GGUFs, detect MTP and mmproj companions, and estimate memory use.
- Detect CPU, RAM speed and usage, dedicated GPU, and VRAM on Windows.
- Start, stop, and monitor `llama-server`; expose logs, slots, speed, and context controls.
- Generate and validate the `llama-server` command line from UI controls.
- Provide a complete catalog of arguments from the installed `llama-server --help`, with search, categories, descriptions, aliases, and value editing.
- Main navigation is organized into `Ejecutar`, `Modelos`, and `Runtime`.
- The interface is in Spanish and targets a minimum window of 960 × 640.
- No cloud account, telemetry upload, or bundled model weights.

## Brand Commitments

The name is EzLLM. The interface should feel professional and futuristic, favor clarity and speed over decoration, and use dense, uniform controls rather than oversized marketing sections. The user explicitly values a simpler main surface with advanced capability still available.

## Evidence on Hand

- Working Tauri app and Rust backend in this repository.
- Local llama.cpp builds available for native help and QA.
- Real hardware detection for the development machine.
- No customer logos, testimonials, benchmarks, or commercial claims; future work must not fabricate them.

## Product Principles

1. Local control stays visible: every action maps to a real file, process, or command.
2. Start simple, go deep: common tasks are immediate; advanced flags remain one search away.
3. Prefer measured truth: hardware, sizes, compatibility, and generated commands come from the machine.
4. One coherent vocabulary across execute, models, and runtime.
5. The app disappears into the task; status and feedback are always legible.

## Accessibility & Inclusion

Keyboard reachability, visible focus, readable contrast, and non-color-only state labels are required. The compact desktop layout must remain usable at the minimum window size.
