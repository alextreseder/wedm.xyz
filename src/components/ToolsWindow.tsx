import React, { useState } from 'react';

const TABS = ["CAM", "G-code", "Kernel", "Drill", "Spark", "Cost", "Dev"];

const ToolsWindow: React.FC = () => {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: 'hsl(240, 14%, 10%)', // Eigengrau
      display: 'flex',
      flexDirection: 'column',
      color: 'white',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Tab Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        borderBottom: '1px solid #333',
        backgroundColor: '#1a1a1a'
      }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 12px',
              backgroundColor: activeTab === tab ? 'hsl(240, 14%, 10%)' : 'transparent',
              color: activeTab === tab ? '#fff' : '#888',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #007acc' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'background-color 0.2s'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div style={{
        flexGrow: 1,
        padding: '20px',
        overflowY: 'auto'
      }}>
        <h3 style={{ marginTop: 0 }}>{activeTab}</h3>
        <p style={{ color: '#aaa', fontSize: '14px' }}>
          This is the {activeTab} tool panel. Content for this specific tool will be rendered here.
        </p>
      </div>
    </div>
  );
};

export default ToolsWindow;
