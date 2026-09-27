import { Chooser } from './app/Chooser'
import { Shell } from './app/Shell'
import { useStore } from './app/store'
import { HomePage } from './pages/home/HomePage'
import { CalcPage } from './pages/calculate/CalcPage'
import { TuningPage } from './pages/tuning/TuningPage'
import { SimPage } from './pages/simulate/SimPage'
import { LearnPage } from './pages/learn/LearnPage'
import { ArmHomePage } from './pages/arm/ArmHomePage'
import { ArmCalcPage } from './pages/arm/ArmCalcPage'
import { ArmSimPage } from './pages/arm/ArmSimPage'
import { ArmTuningPage } from './pages/arm/ArmTuningPage'
import { ArmLearnPage } from './pages/arm/ArmLearnPage'

export default function App() {
  const { page, track } = useStore()
  if (!track) return <Chooser />
  if (track === 'arm')
    return (
      <Shell>
        {page === 'home' && <ArmHomePage />}
        {page === 'calc' && <ArmCalcPage />}
        {page === 'tune' && <ArmTuningPage />}
        {page === 'sim' && <ArmSimPage />}
        {page === 'learn' && <ArmLearnPage />}
      </Shell>
    )
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
