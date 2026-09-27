import { Shell } from './app/Shell'
import { useStore } from './app/store'
import { HomePage } from './pages/home/HomePage'
import { CalcPage } from './pages/calculate/CalcPage'
import { TuningPage } from './pages/tuning/TuningPage'
import { SimPage } from './pages/simulate/SimPage'
import { LearnPage } from './pages/learn/LearnPage'

export default function App() {
  const { page } = useStore()
  return (
    <Shell>
      {page === 'home' && <HomePage />}
      {page === 'calc' && <CalcPage />}
      {page === 'tune' && <TuningPage />}
      {page === 'sim' && <SimPage />}
      {page === 'learn' && <LearnPage />}
    </Shell>
  )
}
