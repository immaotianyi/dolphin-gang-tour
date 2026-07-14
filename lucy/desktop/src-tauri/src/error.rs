/**
 * 统一错误类型 — 使用 thiserror 派生
 * 所有生产代码用 ? 传播，禁止 .unwrap()
 */
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LucyError {
    #[error("USB device error: {0}")]
    Usb(String),

    #[error("Protocol error: {0}")]
    Protocol(String),

    #[error("Device not connected")]
    NotConnected,

    #[error("Device not found")]
    NotFound,

    #[error("AI API error: {0}")]
    Ai(String),

    #[error("Compliance violation: {0}")]
    Compliance(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Gateway rejected: {0}")]
    GatewayRejected(String),
}

impl From<LucyError> for String {
    fn from(e: LucyError) -> String {
        e.to_string()
    }
}

impl serde::Serialize for LucyError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type LucyResult<T> = Result<T, LucyError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let e = LucyError::NotConnected;
        assert_eq!(e.to_string(), "Device not connected");

        let e = LucyError::Usb("port not found".to_string());
        assert_eq!(e.to_string(), "USB device error: port not found");
    }

    #[test]
    fn test_error_serialization() {
        let e = LucyError::Protocol("invalid frame".to_string());
        let serialized = serde_json::to_string(&e).unwrap();
        assert!(serialized.contains("invalid frame"));
    }

    #[test]
    fn test_error_from_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let lucy_err: LucyError = io_err.into();
        assert!(matches!(lucy_err, LucyError::Io(_)));
    }

    #[test]
    fn test_error_from_serde() {
        let serde_err = serde_json::from_str::<serde_json::Value>("invalid").unwrap_err();
        let lucy_err: LucyError = serde_err.into();
        assert!(matches!(lucy_err, LucyError::Serde(_)));
    }

    #[test]
    fn test_error_to_string() {
        let e = LucyError::Config("missing key".to_string());
        let s: String = e.into();
        assert!(s.contains("missing key"));
    }
}
