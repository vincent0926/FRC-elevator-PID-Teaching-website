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
import { FlywheelCalcPage } from './pages/flywheel/FlywheelCalcPage'
import { ArmLessonsPage, ElevatorLessonsPage, FlywheelLessonsPage } from './pages/lessons/LessonsPage'

export default function App() {
  const { page, track } = useStore()
  if (!track) return <Chooser />
  // 射球飛輪只有 1F、3F 和教學關卡：停在其他樓層（例如深層連結）就顯示 1F
  if (track === 'flywheel')
    return <Shell>{page === 'sim' ? <FlywheelSimPage /> : page === 'lessons' ? <FlywheelLessonsPage /> : <FlywheelCalcPage />}</Shell>
  if (track === 'arm')
    return (
      <Shell>
        {page === 'home' && <ArmHomePage />}
        {page === 'calc' && <ArmCalcPage />}
        {page === 'lessons' && <ArmLessonsPage />}
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
      {page === 'lessons' && <ElevatorLessonsPage />}
      {page === 'tune' && <TuningPage />}
      {page === 'sim' && <SimPage />}
      {page === 'learn' && <LearnPage />}
      {page === 'guide' && <GuidePage />}
    </Shell>
  )
}
