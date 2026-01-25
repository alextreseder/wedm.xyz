import TopBar from './components/TopBar';
import MainLayout from './components/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import './style.css';

/**
 * Main Application Component
 * Composes the TopBar and the Golden Layout based MainLayout.
 */
function App() {
  return (
    <ErrorBoundary>
      <TopBar />
      <MainLayout />
    </ErrorBoundary>
  );
}

export default App;
