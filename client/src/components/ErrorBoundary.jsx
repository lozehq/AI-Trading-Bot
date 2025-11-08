import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info });
    // 将错误输出到控制台，便于定位打包后的报错
    // 同时附带组件堆栈，结合 SourceMap 可快速定位
    console.error('🛑 前端运行时错误捕获:', error);
    console.error('🧩 组件栈信息:', info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-4 rounded border border-accent-danger/40 bg-accent-danger/10 text-sm">
          <div className="font-semibold text-accent-danger mb-2">前端出现错误</div>
          <div className="text-dark-muted">
            {this.state.error?.message || '未知错误'}
          </div>
          <div className="mt-2 text-[10px] text-dark-muted whitespace-pre-wrap">
            {this.state.info?.componentStack}
          </div>
          <div className="mt-2 text-[10px] text-dark-muted">已记录到控制台(console)</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;


