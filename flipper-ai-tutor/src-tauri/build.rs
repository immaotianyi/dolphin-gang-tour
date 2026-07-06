fn main() {
    // ---- 编译 Flipper Zero Protobuf 定义 ----
    // proto/ 目录下存放从 https://github.com/flipperdevices/flipperzero-protobuf 克隆的 .proto 文件
    // prost-build 会在 OUT_DIR 下生成对应的 Rust 模块（flipper.rs / system.rs / storage.rs / gui.rs 等）

    let proto_dir = std::path::Path::new("proto");

    if proto_dir.exists() {
        let mut config = prost_build::Config::new();

        // 对 generated 代码添加 serde 支持，方便直接序列化/反序列化
        config.out_dir(std::env::var("OUT_DIR").unwrap());

        // 编译所有需要的 .proto 文件（flipper.proto 是入口，会自动 import 其他）
        let proto_files = [
            "proto/flipper.proto",
            "proto/system.proto",
            "proto/storage.proto",
            "proto/gui.proto",
            "proto/gpio.proto",
            "proto/property.proto",
            "proto/application.proto",
            "proto/desktop.proto",
        ];

        config
            .compile_protos(&proto_files, &["proto"])
            .expect("Failed to compile flipper protobuf files");

        // 当 proto 文件变更时重新编译
        for f in &proto_files {
            println!("cargo:rerun-if-changed={}", f);
        }
        println!("cargo:rerun-if-changed=proto/");
    } else {
        println!("cargo:warning=proto/ directory not found — RPC protobuf features will be disabled");
    }

    // ---- Tauri 构建 ----
    tauri_build::build()
}
