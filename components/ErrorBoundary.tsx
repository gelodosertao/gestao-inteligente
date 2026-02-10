import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 p-8 text-center text-slate-800">
                    <h1 className="text-3xl font-bold text-red-600 mb-4">Algo deu errado 😕</h1>
                    <p className="mb-4 text-lg">O sistema encontrou um erro inesperado.</p>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-red-200 max-w-2xl w-full text-left overflow-auto mb-6">
                        <h2 className="font-bold text-red-700 mb-2">Erro:</h2>
                        <pre className="text-sm font-mono text-red-600 mb-4 whitespace-pre-wrap">
                            {this.state.error?.toString()}
                        </pre>

                        <h2 className="font-bold text-slate-700 mb-2">Detalhes (Stack):</h2>
                        <pre className="text-xs font-mono text-slate-500 whitespace-pre-wrap max-h-64 overflow-y-auto">
                            {this.state.errorInfo?.componentStack}
                        </pre>
                    </div>

                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
                    >
                        Tentar Recarregar Página
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
