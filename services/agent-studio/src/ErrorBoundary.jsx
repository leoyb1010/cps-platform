import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Agent Studio crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatalError">
        <div>
          <strong>工作台遇到异常</strong>
          <p>{this.state.error.message || "未知错误"}</p>
          <button onClick={() => window.location.reload()}>重新加载</button>
        </div>
      </main>
    );
  }
}
