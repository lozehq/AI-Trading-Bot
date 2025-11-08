# VPN/魔法上网警告弹窗功能

> **功能**: 启动时提示用户需要使用魔法上网才能访问 OKX 等接口  
> **创建时间**: 2025-11-06

---

## 📋 功能说明

### 弹窗特性

1. **自动显示**
   - 首次访问网站时自动弹出
   - 延迟 500ms 显示，让页面先加载完成

2. **两种关闭方式**
   - **我知道了**: 简单关闭，下次启动仍会提示
   - **不再提示**: 永久关闭，下次启动不再显示

3. **本地存储**
   - 使用 `localStorage` 保存用户选择
   - 键名: `vpn_warning_permanently_closed`
   - 值: `'true'` 表示永久关闭

---

## 🎨 UI 设计

### 视觉效果
- **背景**: 黑色半透明遮罩 + 模糊效果
- **弹窗**: 渐变背景（灰色到深灰）+ 黄色边框
- **图标**: 
  - 警告图标（AlertTriangle）- 黄色
  - WiFi 图标 - 蓝色
  - 地球图标 - 绿色
- **动画**: 淡入淡出 + 缩放效果

### 内容结构
```
┌─────────────────────────────────┐
│  ⚠️  重要提示                    │
│     Important Notice            │
├─────────────────────────────────┤
│  📶 需要魔法上网                 │
│  本项目使用的数据接口需要VPN     │
├─────────────────────────────────┤
│  🌍 受影响的功能                 │
│  • OKX 交易所数据获取            │
│  • Binance 市场数据              │
│  • CoinGecko 行情信息            │
│  • 实时价格推送                  │
├─────────────────────────────────┤
│  ℹ️  如果已启用魔法上网，请忽略   │
├─────────────────────────────────┤
│  [我知道了]  [不再提示]          │
└─────────────────────────────────┘
```

---

## 📁 文件结构

### 新增文件
```
client/src/components/VPNWarningModal.jsx  # 弹窗组件
```

### 修改文件
```
client/src/App.jsx  # 导入并使用弹窗组件
```

---

## 💻 代码实现

### 组件导入
```jsx
// client/src/App.jsx
import VPNWarningModal from './components/VPNWarningModal';

function App() {
  return (
    <div>
      {/* 其他组件 */}
      <VPNWarningModal />
    </div>
  );
}
```

### 核心逻辑
```jsx
// client/src/components/VPNWarningModal.jsx
const [isVisible, setIsVisible] = useState(false);

useEffect(() => {
  // 检查是否永久关闭
  const isPermanentlyClosed = localStorage.getItem('vpn_warning_permanently_closed');
  
  if (!isPermanentlyClosed) {
    setTimeout(() => setIsVisible(true), 500);
  }
}, []);

const handleClose = (permanent = false) => {
  if (permanent) {
    localStorage.setItem('vpn_warning_permanently_closed', 'true');
  }
  setIsVisible(false);
};
```

---

## 🔧 使用方法

### 用户操作

1. **首次访问**
   - 打开网站后 500ms 自动弹出提示
   - 阅读提示内容

2. **临时关闭**
   - 点击 "我知道了" 按钮
   - 本次会话关闭弹窗
   - 下次打开网站仍会提示

3. **永久关闭**
   - 点击 "不再提示" 按钮
   - 永久关闭弹窗
   - 下次打开网站不再提示

4. **重新启用提示**
   - 打开浏览器开发者工具（F12）
   - 进入 Console 标签
   - 输入: `localStorage.removeItem('vpn_warning_permanently_closed')`
   - 刷新页面即可重新看到提示

---

## 🎯 技术细节

### 状态管理
- `isVisible`: 控制弹窗显示/隐藏
- `isClosing`: 控制关闭动画

### 动画效果
- **淡入**: `opacity-0` → `opacity-100` (300ms)
- **淡出**: `opacity-100` → `opacity-0` (300ms)
- **缩放**: `scale-95` → `scale-100` (300ms)

### 响应式设计
- 移动端: `max-w-md` + `mx-4` (左右边距)
- 桌面端: 固定最大宽度，居中显示

### 可访问性
- 点击遮罩层可关闭弹窗
- 点击弹窗内容不会关闭
- ESC 键暂未实现（可扩展）

---

## 🔄 扩展建议

### 可选功能

1. **ESC 键关闭**
```jsx
useEffect(() => {
  const handleEsc = (e) => {
    if (e.key === 'Escape') handleClose(false);
  };
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, []);
```

2. **多语言支持**
```jsx
import { useLanguage } from '../hooks/useLanguage';

const { t } = useLanguage();
<h2>{t('vpn_warning.title')}</h2>
```

3. **自定义显示时机**
```jsx
// 只在特定页面显示
const shouldShow = activeTab === 'trading' || activeTab === 'dashboard';
```

4. **显示次数限制**
```jsx
// 最多显示3次后自动永久关闭
const showCount = parseInt(localStorage.getItem('vpn_warning_count') || '0');
if (showCount < 3) {
  localStorage.setItem('vpn_warning_count', String(showCount + 1));
  setIsVisible(true);
}
```

---

## ✅ 测试清单

- [x] 首次访问自动显示
- [x] 点击"我知道了"临时关闭
- [x] 点击"不再提示"永久关闭
- [x] 刷新页面后行为正确
- [x] 动画效果流畅
- [x] 移动端显示正常
- [x] 点击遮罩层关闭
- [x] localStorage 正确保存

---

## 📝 总结

VPN 警告弹窗功能已成功实现，具备以下特点：
- ✅ 用户友好的提示界面
- ✅ 灵活的关闭选项
- ✅ 持久化存储用户选择
- ✅ 流畅的动画效果
- ✅ 响应式设计

用户可以根据自己的需求选择临时关闭或永久关闭提示。

