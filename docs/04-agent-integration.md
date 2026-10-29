# Agent 接入

## 读取契约

```bash
node cli/lecture-axis.mjs schema --json
```

输出包含全部命令、参数、数据契约（概念条目、讲稿块、挂载指针、介质内容）与标签与挂载规则。

## 典型闭环

1. `status` —— 读取当前讲稿规模与验收结论。
2. `validate` —— 拿到逐项证据，判断是否可以交付。
3. `run` 或 `relabel` —— 触发流水线（讲稿变化后用 `relabel`）。
4. `skill <id> --input "..."` —— 单独试跑某个技能，验证提示词改动是否有效。
5. 再 `status` —— 确认产物变化。

## HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/bootstrap | 全量数据、校验与标签字典 |
| GET | /api/lecture/validation | 验收报告 |
| POST | /api/lecture/run | 运行四段流水线 |
| POST | /api/lecture/relabel | 重算标注与挂载 |
| POST | /api/lecture/suggestions | 生成逐行挂载建议 |
| POST | /api/lecture/suggestions/:id/apply | 确认或修改一条建议 |
| POST | /api/lecture/suggestions/:id/reject | 拒绝一条建议 |
| POST | /api/lecture/suggestions/apply-all | 按置信度门槛批量确认 |
| PATCH | /api/skills/:id | 停用技能、改参数与提示词 |
| POST | /api/skills/:id/run | 单独执行技能 |
| PATCH | /api/engines/:id | 调整引擎配置 |
| PATCH | /api/settings | 运行参数 |

## 边界

Agent 只在结构化数据上工作：不修改界面状态，不绕过验收。挂载建议由人确认，Agent 不代替人做取舍。