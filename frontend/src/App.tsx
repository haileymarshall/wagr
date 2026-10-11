import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { WalletButton } from './components/WalletButton'
import { Ticker } from './components/Ticker'
import { arc, escrowAddress, isMainnet } from './lib/arc'
import { Create } from './pages/Create'
import { Duel } from './pages/Duel'
import { Explore } from './pages/Explore'
import { Home } from './pages/Home'
import { MyDuels } from './pages/MyDuels'

export function App() {
  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-row">
          <Link to="/" className="brand" aria-label="Wagr home">
            <span className="brand-mark" aria-hidden>
              <i className="bm-yes" />
              <i className="bm-no" />
            </span>
            <span className="brand-word">Wagr</span>
          </Link>
          {!isMainnet && <span className="net-badge">{arc.name}</span>}
          <nav className="nav">
            <NavLink to="/duels">Duels</NavLink>
            <NavLink to="/new">Start a duel</NavLink>
            <NavLink to="/me">My duels</NavLink>
          </nav>
          <span className="grow" />
          <WalletButton />
        </div>
        <Ticker />
      </header>

      <main className="main">
        {!escrowAddress && <div className="notice neg">Wagr isn't deployed on {arc.name} yet.</div>}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/duels" element={<Explore />} />
          <Route path="/new" element={<Create />} />
          <Route path="/duel/:id" element={<Duel />} />
          <Route path="/me" element={<MyDuels />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>

      <footer className="footer">
        <span className="brand-word small">Wagr</span>
        <span>Two people, one bet. Settled in USDC on Arc, judged by GenLayer.</span>
      </footer>
    </div>
  )
}
