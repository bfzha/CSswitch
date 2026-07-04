//! 旧固定槽配置（schema v1）的只读副本，仅供一次性迁移读取。生产代码不再写它。
//!
//! v1 = PR #4 「每家固定槽」形态：顶层 `provider` 指针 + `providers: {slot -> {key, base_url, model}}`。
//! v2（[`crate::config`]）改为用户自管命名 `profiles` 列表 + `active_id` 生效指针。
//! 迁移只读这里、写新结构，读完即弃；这些类型永不参与保存。
use serde::Deserialize;
use std::collections::BTreeMap;

/// 旧单槽配置（等价于旧 `config::ProviderCfg`）。字段全 optional，缺字段的更旧文件也能读。
#[derive(Deserialize, Clone, Default)]
pub struct ProviderCfgV1 {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
}

/// 旧顶层配置（等价于旧 `config::Config`）。端口/mode 复用新配置的默认函数保持一致。
#[derive(Deserialize, Clone)]
pub struct ConfigV1 {
    #[serde(default)]
    pub provider: String,
    #[serde(default = "crate::config::default_proxy_port")]
    pub proxy_port: u16,
    #[serde(default = "crate::config::default_sandbox_port")]
    pub sandbox_port: u16,
    #[serde(default)]
    pub secret: String,
    #[serde(default = "crate::config::default_mode")]
    pub mode: String,
    #[serde(default)]
    pub providers: BTreeMap<String, ProviderCfgV1>,
}
