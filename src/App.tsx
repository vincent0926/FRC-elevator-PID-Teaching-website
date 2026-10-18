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
import { GuidePage } from './pages/guide/GuidePage'
import { FlywheelSimPage } from './pages/flywheel/FlywheelSimPage'

export default function App() {
  const { page, track } = useStore()
  if (!track) return <Chooser />
  // 射球飛輪只有一頁：不管網址停在哪一樓都顯示模擬
  if (track === 'flywheel')
    return (
      <Shell>
        <FlywheelSimPage />
      </Shell>
    )
  if (track === 'arm')
    return (
      <Shell>
        {page === 'home' && <ArmHomePage />}
        {page === 'calc' && <ArmCalcPage />}
        {page === 'tune' && <ArmTuningPage />}
        {page === 'sim' && <ArmSimPage />}
        {page === 'learn' && <ArmLearnPage />}
        {page === 'guide' && <GuidePage />}
      </Shell>
    )
  return (
    <Shell>
      {page === 'home' && <HomePage />}
      {page === 'calc' && <CalcPage />}
      {page === 'tune' && <TuningPage />}
      {page === 'sim' && <SimPage />}
      {page === 'learn' && <LearnPage />}
      {page === 'guide' && <GuidePage />}
    </Shell>
  )
}
