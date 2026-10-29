# 常见问题

## 页面显示「讲义轴服务未连接」

服务没起，或端口被占用。

```bash
npm start
```

换端口：`LECTURE_AXIS_PORT=8899 npm start`，浏览器也要访问同一端口。

## 流水线运行后建议变少或变多

建议数量等于讲稿块数量。过渡衔接行也会得到一条低置信建议（默认不挂载），批量确认时会被门槛挡下。

## 一键确认没有全部确认

低置信建议（默认低于 0.6）不会被批量确认。这是有意设计：过渡行、弱信号行需要人逐条判断。可以在技能台调 `mount-advisor` 的 `confidenceFloor`。

## 模型不可用

未配置 API Key、地址错误或调用失败都会自动回落到本地确定性引擎，功能不受影响，只影响建议的具体措辞。在设置台点「测试」可看到具体报错。

## 重算标注后块编号变了

重算会按当前讲稿重新切分，块编号可能重排。概念锚点与回指会随之更新，跨块引用的旧编号不再有效——这是「标注与讲稿同批生成」的直接后果。

## 数据损坏

`data/store.json` 是唯一数据文件，备份它即可恢复；`data/seed-lecture.json` 是出厂讲稿，`POST /api/system/reset` 或 `node cli/lecture-axis.mjs reset --yes` 可恢复出厂状态。

## 端口被占用

```powershell
Get-NetTCPConnection -LocalPort 8790
```