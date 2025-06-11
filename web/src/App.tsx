import './App.css';
import PortfolioInvestment from './PortfolioInvestment';
const logo = require('./logo.svg');

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          <PortfolioInvestment/>
        </p>
      </header>
    </div>
  );
}

export default App;
