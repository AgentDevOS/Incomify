# 小程序交付结论

## 结论

当前仓库的小程序交付流程已经统一成一个固定约定：

- 交付目录使用 `release/miniprogram/`
- 平台会把该目录同步到部署区
- 项目头部会提供“小程序交付”入口
- 入口弹窗优先展示 `preview-qr.png`
- 如果没有现成的下载二维码，前端会根据交付包地址本地生成二维码

## 推荐目录

```text
release/miniprogram/
  miniprogram.zip
  preview-qr.png
  README.md
```

## 交付包约定

- `miniprogram.zip` 用作小程序交付包的默认文件名
- 如果目录里存在其他压缩包，平台也会优先识别 `zip`、`rar`、`7z` 文件作为下载目标
- `preview-qr.png` 建议使用微信开发者工具生成，用于直接打开微信预览

## 平台行为

- 后端允许同步 `mini-program` 产物类型
- 同步来源支持 `release/miniprogram`，兼容 `dist/miniprogram`
- 前端弹窗中有两个二维码区域，一个给微信预览，一个给交付包下载

## 验收结论

只要项目内满足以下条件，就可以按这条链路交付：

- `release/miniprogram/` 下存在可导入或可分发的交付包
- `preview-qr.png` 已生成，或者接受使用占位提示
- 部署目录可通过当前项目的统一部署入口访问
