# CLI

先启动服务（`npm start`），再在另一个终端执行。

```bash
node cli/lecture-axis.mjs schema --json          # 全部命令与数据契约
node cli/lecture-axis.mjs doctor                 # 环境自检
node cli/lecture-axis.mjs status --json          # 当前讲稿概况与验收结论
node cli/lecture-axis.mjs validate --json        # 六项验收检查与证据
node cli/lecture-axis.mjs skills --json          # 技能台账
node cli/lecture-axis.mjs skill concept-card --input "记录权是……"
node cli/lecture-axis.mjs run --topic "主题" --material-file a.md --mode script --json
node cli/lecture-axis.mjs relabel                # 按现有讲稿重算标注与挂载
node cli/lecture-axis.mjs export --out lecture.json
node cli/lecture-axis.mjs reset --yes
```

服务地址默认 `http://127.0.0.1:8790`，可用 `--url` 或环境变量 `LECTURE_AXIS_URL` 覆盖。