<div align="center">
<img width="64" height="64" alt="Group 4" src="https://github.com/user-attachments/assets/babf83e2-424d-466f-a50c-f2045481f045" />
<h1>FnOS_UI_Mods</h1>
<p>为 FnOS 的 UI 增加平滑圆角、毛玻璃背景及更多的悬停动画</p>
<img width="1944" height="1104" alt="截屏" src="https://github.com/user-attachments/assets/2c8badad-ad59-480c-b46d-19cf1dfd98f5" />
<p>*图中字体为 Inter + OPPO Sans 4.0，项目内不提供相关字体。</p>
</div>

## 介绍
基于向 WebUI HTML 内注入 CSS 与 JS 来实现修改样式和平滑圆角。使用了`corner-shape`属性来实现平滑圆角，需要 Chrome 139 版本及以上才能获得最佳效果。

### 可选项
窗口标题栏提供传统（类 Windows）与反转（类 macOS）两种样式：

!["传统"样式预览](https://github.com/user-attachments/assets/518ea41c-bc6e-4acf-a7e2-dac3107c382f)
!["反转"样式预览](https://github.com/user-attachments/assets/821c2176-768a-4eaa-8a38-5c6d56c6e2dd)

两套样式均在 mod.css 内提供，需要自己通过修改注释来切换。

## 使用方法：

### 浏览器插件注入（推荐）
仓库内提供了一个 MV3 浏览器插件：`browser-extension/`。你可以使用该插件直接在本机页面注入本项目同版本的全部mod，同时还支持快速切换两种窗口标题栏样式。无需修改 NAS 系统文件，出问题一键即可取消注入。

### 使用方法
1. 打开 Chrome / Edge 扩展管理页。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”，目录选 `browser-extension/`。
4. 打开插件弹出窗口设置是否注入，启用注入和选择标题栏样式即时生效，取消注入需要刷新页面。
   
### 直接注入至 NAS 系统文件

1. 拉取源代码
   
<details>
  <summary>- 使用 SSH 终端注入</summary>
  
  2. 将文件存放到 NAS 内
  3. 使用 SSH 连接到 NAS
  4. 在终端内执行`inject_fnos.sh`，进行 CSS 与 JS 的注入
  5. 刷新 WebUI 页面

</details>

<details>
  <summary>- 使用 FPK 应用注入</summary>
  
  2. 在应用中心内手动安装 FPK 安装包
  3. 打开“飞牛自定义工具”，选择文件并注入
  4. 刷新 WebUI 页面

</details>

## 请注意：
本项目是对官方 WebUI HTML 文件的补丁项目，其原理为：动态向官方 WebUI 的 HTML head 部分插入自定义 patch 内容，用以增强 UI 层级显示和用户自定义功能。本项目可能依赖或受 WebUI 官方版本更新影响，如官方结构调整，本补丁可能无法正常工作或出现兼容性问题。不对补丁在未来版本中的可用性、兼容性或迁移支持做出任何保证。
**该项目为个人开发学习作品，并非飞牛官方内容，也未得到飞牛官方授权或认可。**

### 使用风险提示
本项目按“现状”（AS IS）提供，不提供任何明示或暗示的担保，包括但不限于适销性、适用于特定用途或不侵权等任何保证。用户在使用本项目及其修改或衍生版本时可能会遇到错误或意外行为，对使用过程中出现的任何问题（包括但不限于数据丢失、系统异常等），**用户需自行承担全部风险与责任**。在任何情况下，作者及贡献者对因使用本项目而导致的任何损害（直接、间接、偶发、特殊或后果性损害）均不承担责任。
