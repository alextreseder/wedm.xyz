import TopBar from './components/TopBar';
import MainLayout from './components/MainLayout';
import './style.css';

/**
 * Main Application Component
 * Composes the TopBar and the Golden Layout based MainLayout.
 */
function App() {
  return (
    <>
      <TopBar />
      <MainLayout />
    </>
  );
}

export default App;
