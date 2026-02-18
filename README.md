<div align="center">
<h1>
   <picture>
     <source 
    srcset="https://github.com/user-attachments/assets/3984cd0e-f3ed-4727-8bfe-67b8969479d0" 
    media="(prefers-color-scheme: dark)" 
    height="28"
  />
  <source 
    srcset="https://github.com/user-attachments/assets/4203f08b-7eb8-480c-aa94-582bd0eefa65" 
    media="(prefers-color-scheme: light)" 
    height="28"
  />
  <img 
    src="https://github.com/user-attachments/assets/4203f08b-7eb8-480c-aa94-582bd0eefa65" 
    height="28"
  />
</picture>
</h1>
<p>为 FnOS 的 UI 增加平滑圆角、毛玻璃背景及更多的悬停动画</p>
<img width="1944" height="1104" alt="截屏" src="https://github.com/user-attachments/assets/2c8badad-ad59-480c-b46d-19cf1dfd98f5" />
<p>*图中字体为 Inter + OPPO Sans 4.0，项目内不提供相关字体。</p>
</div>

## 介绍
基于向 WebUI HTML 内注入 CSS 与 JS 来实现修改样式和平滑圆角。使用了`corner-shape`属性来实现平滑圆角，需要 Chrome 139 版本及以上才能获得最佳效果。本项目为飞牛 WebUI 提供了以下优化：
- 窗口背景模糊
- 窗口打开、关闭、最小化、还原动画
- 任务栏图标过多滚动
- 任务栏精简
- 更多鼠标悬停动画
- 更清晰的右键菜单
- 更好的桌面图标、启动台响应式
- 大多数区域的平滑圆角
- 可选的优化版窗口标题栏样式
- 自定义 UI 主题色
- 自定义 UI 字体

### 可选项
#### 窗口标题栏
提供传统（类 Windows）与反转（类 macOS）两种样式：

!["传统"样式预览](https://github.com/user-attachments/assets/518ea41c-bc6e-4acf-a7e2-dac3107c382f)
!["反转"样式预览](https://github.com/user-attachments/assets/821c2176-768a-4eaa-8a38-5c6d56c6e2dd)

#### 启动台
提供传统（类 macOS 全屏启动台）与聚焦（类 macOS 新版聚焦启动台）两种样式：

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/d05ac1fd-f4d9-485f-9a53-aa56ef5484a2" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/8da9e62b-19ff-4980-bd08-bc3b5401352b" />

以上可选项均在项目内提供，可在构建 mod css 时在终端内进行配置。如果你使用浏览器插件注入，即可在插件弹出窗口进行配置。

## 使用方法：

### 浏览器插件注入（推荐）
你可以直接在浏览器开发者模式下，将整个项目文件夹作为插件导入进浏览器，直接在本机内页面注入本项目的全部 mod，拓展可智能识别当前页面是否飞牛 Web UI，同时还可以快速切换自定义设置。无需修改 NAS 系统文件，出问题也可快速取消注入。

1. 拉取源代码
2. 打开 Chrome / Edge 扩展管理页。
3. 开启“开发者模式”。
4. 选择“加载已解压的扩展程序”，目录选本项目文件夹。
5. 打开插件弹出窗口设置注入选项，启用注入和配置可选项大多数时候可以即时生效，如果遇到没有生效，或是关闭注入开关后请刷新页面。
   
### 直接注入至 NAS 系统文件

1. 拉取源代码
2. 使用 `pnpm build` 或任何你喜欢的包管理器的 `build` 指令构建项目（或者直接执行 `node scripts/build.js`）
   
<details>
  <summary>- 使用 SSH 终端注入</summary>
  
  2. 将构建文件存放到 NAS 内，并使用 SSH 连接到 NAS
  3. 在终端内执行`inject_fnos.sh`，进行 CSS 与 JS 的注入
  4. 刷新 WebUI 页面

</details>

<details>
  <summary>- 使用 FPK 应用注入</summary>
  
  2. 在应用中心内手动安装 FPK 安装包
  3. 打开“飞牛自定义工具”，选择构建文件并注入
  4. 刷新 WebUI 页面

</details>

## 请注意：
本项目是对官方 WebUI HTML 文件的补丁项目，其原理为：动态向官方 WebUI 的 HTML head 部分插入自定义 patch 内容或是通过浏览器插件 Content Script 向页面插入自定义内容，用以增强 UI 层级显示和用户自定义功能。本项目可能依赖或受 WebUI 官方版本更新影响，如官方结构调整，本补丁可能无法正常工作或出现兼容性问题。不对补丁在未来版本中的可用性、兼容性或迁移支持做出任何保证。
**该项目为个人开发学习作品，很多内容由 Codex 构建，并非飞牛官方内容，也未得到飞牛官方授权或认可。**

> [!IMPORTANT]
> 本项目按“现状”（AS IS）提供，不提供任何明示或暗示的担保，包括但不限于适销性、适用于特定用途或不侵权等任何保证。用户在使用本项目及其修改或衍生版本时可能会遇到错误或意外行为，对使用过程中出现的任何问题（包括但不限于数据丢失、系统异常等），**用户需自行承担全部风险与责任**。在任何情况下，作者及贡献者对因使用本项目而导致的任何损害（直接、间接、偶发、特殊或后果性损害）均不承担责任。

## 许可
本项目采用 `FnOS UI Mods Non-Commercial License 1.0` 自定义许可证。

- 允许个人和组织在非商业场景下使用、修改和分发。
- 明确禁止任何直接或间接盈利用途（包括但不限于售卖、付费服务集成、付费定制与商业支持）。
- 详细条款见 [`LICENSE`](https://github.com/aurysian-yan/fnOS_UI_Mods/blob/main/LICENSE) 文件。
