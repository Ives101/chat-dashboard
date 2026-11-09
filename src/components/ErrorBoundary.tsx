"use client";
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center max-w-md px-6">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-lg font-medium text-gray-300 mb-2">Something went wrong</p>
            <p className="text-sm text-gray-500 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}