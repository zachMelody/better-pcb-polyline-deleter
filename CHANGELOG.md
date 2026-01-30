# Changelog

本文件记录此扩展的所有重要更改。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-01-30

### 新增

- 初始版本发布
- `deleteConnectedTracesForSelected()`: 删除与选中元件连接的指定网络走线
  - 弹出多选对话框，让用户选择要删除的网络
  - 二次确认：选择后弹出确认对话框显示已选网络，防止误删
  - 使用 `getEntireTrack()` 追踪整条走线，删除干净
  - 支持批量选中多个元件同时处理
- `about()`: 显示扩展版本信息
- 菜单注册: 首页和 PCB 编辑器均可访问
