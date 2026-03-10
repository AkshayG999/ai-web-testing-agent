import { useState } from 'react';
import Sidebar from './components/Sidebar';
import NewRunView from './components/NewRunView';
import ProfilesView from './components/ProfilesView';
import HistoryView from './components/HistoryView';
import ReportsView from './components/ReportsView';
import SettingsView from './components/SettingsView';

function App() {
  const [activeView, setActiveView] = useState('run');

  return (
    <div className="layout">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="content">
        {activeView === 'run' && <NewRunView />}
        {activeView === 'profiles' && <ProfilesView />}
        {activeView === 'history' && <HistoryView />}
        {activeView === 'reports' && <ReportsView />}
        {activeView === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}

export default App;
