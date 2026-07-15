/**
 * 安全审查模块
 *
 * 五层安全架构:
 *   1. Physical Kill Switch (硬件)
 *   2. Firmware whitelist (固件)
 *   3. AST review (badusb_guard.rs)  ← 本模块
 *   4. AI compliance (Phase 3)
 *   5. Legal EULA (前端)
 */
pub mod badusb_guard;
