import CompanyWidget from './components/CompanyWidget'
import './App.css'

function App() {
  // Get group and tier from URL parameters for company widget
  const urlParams = new URLSearchParams(window.location.search);
  const groupName = urlParams.get('group') || '_BWI_Fernao Digital Solutions';
  const tier = urlParams.get('tier') || 'Premier';

  return (
    <div className="app">
      <div className="app-container">
        <CompanyWidget 
          groupName={groupName}
          tier={tier}
        />
      </div>
    </div>
  )
}

export default App
