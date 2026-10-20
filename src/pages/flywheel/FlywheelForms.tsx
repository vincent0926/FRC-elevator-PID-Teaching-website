import { NumberField } from '../../components/NumberField'
import { MOTOR_SPECS, type MotorId } from '../../core/motors'
import { backSurfaceRatio, GAME_PIECES_2026, HUB_2026, releaseAhead, releaseHeight, turretDeg, type DistanceFrom, type FlywheelMechanism, type ShotPlan } from '../../core/flywheel/flywheel'
import { SHAPES } from './flywheelStore'
import { t } from '../../core/lang'

/** 射球飛輪 1F 和 3F「算轉速和仰角」共用的表單：機構、球、2026 HUB */

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function MechFields({ mech, setM }: { mech: FlywheelMechanism; setM: (p: Partial<FlywheelMechanism>) => void }) {
  return (
    <>
      <div className="fields">
        <label className="f">
          {t('馬達', 'Motor')}
          <span className="inp">
            <select value={mech.motor} onChange={(e) => setM({ motor: e.target.value as MotorId })} aria-label={t('馬達', 'Motor')}>
              {Object.values(MOTOR_SPECS).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <NumberField label={t('馬達數量', 'Motor count')} value={mech.motorCount} onChange={(x) => setM({ motorCount: Math.round(x) })} min={1} max={4} step={1} unit={t('顆', 'motors')} />
        <NumberField label={t('齒比', 'Gear ratio')} value={mech.gearRatio} onChange={(x) => setM({ gearRatio: x })} min={0.2} max={5} step={0.05} unit=": 1" hint={t('馬達轉幾圈飛輪轉 1 圈；加速傳動小於 1', 'Motor turns per flywheel turn; below 1 for an overdrive')} />
        <NumberField label={t('會轉的質量', 'Spinning mass')} value={mech.wheelMass} onChange={(x) => setM({ wheelMass: x })} min={0.05} max={10} step={0.1} unit="kg" hint={t('飛輪＋輪子＋軸', 'Flywheel + wheels + shaft')} />
        <NumberField label={t('輪子半徑', 'Wheel radius')} value={mech.wheelRadius} display={100} digits={2} onChange={(x) => setM({ wheelRadius: x })} min={1} max={15} step={0.1} unit="cm" hint={t('推球的那個輪子；上下都有輪子就填大的那邊', 'The wheel that pushes the ball; with wheels on both sides, use the bigger one')} />
        <label className="f">
          {t('重量分布', 'Mass distribution')}
          <span className="inp">
            <select value={mech.shape} onChange={(e) => setM({ shape: Number(e.target.value) })} aria-label={t('重量分布', 'Mass distribution')}>
              {SHAPES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="f">
          {t('球的另一邊', 'Other side of the ball')}
          <span className="inp">
            <select value={mech.back} onChange={(e) => setM({ back: e.target.value === 'rollers' ? 'rollers' : 'hood' })} aria-label={t('球的另一邊', 'Other side of the ball')}>
              <option value="hood">{t('固定導板（不會轉）', 'Fixed hood (doesn’t spin)')}</option>
              <option value="rollers">{t('對面也有滾輪，一起夾著球', 'Rollers on the other side too, gripping the ball')}</option>
            </select>
          </span>
        </label>
      </div>
      {mech.back === 'rollers' && (
        <>
          <div className="fields three" style={{ marginTop: 12 }}>
            <NumberField label={t('對面滾輪半徑', 'Opposite roller radius')} value={mech.backRadius} display={100} digits={2} onChange={(x) => setM({ backRadius: x })} min={0.5} max={15} step={0.1} unit="cm" />
            <NumberField label={t('對面滾輪質量', 'Opposite roller mass')} value={mech.backMass} onChange={(x) => setM({ backMass: x })} min={0} max={5} step={0.05} unit="kg" hint={t('幾根加起來（滾輪＋軸）', 'All of them combined (rollers + shafts)')} />
            <NumberField label={t('對面轉速比', 'Opposite speed ratio')} value={mech.backRatio} onChange={(x) => setM({ backRatio: x })} min={0.1} max={5} step={0.05} unit={t('倍', '×')} hint={t('對面滾輪轉速 ÷ 大輪轉速；同一顆馬達 1:1 帶就填 1', 'Opposite roller speed ÷ main wheel speed; 1 if the same motor drives it 1:1')} />
          </div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            {t(
              <>
              對面輪緣速度是大輪的 {f(backSurfaceRatio(mech), 2)} 倍。球夾在中間，球速 ≈ 0.5 ×（大輪輪緣速度 + 對面輪緣速度）；對面滾輪也會被球拖慢，所以算進轉動慣量和每一發掉的轉速。對面有好幾根的話，半徑填碰到球最後一根的。
              </>,
              <>
                The opposite surface speed is {f(backSurfaceRatio(mech), 2)} × the main wheel’s. With the ball gripped between them, ball speed ≈ 0.5 × (main surface speed + opposite surface speed); the opposite rollers are also slowed by the ball, so they count toward the moment of inertia and the drop per shot. With several rollers on the other side, use the radius of the last one touching the ball.
              </>,
            )}
          </p>
        </>
      )}
    </>
  )
}

/** 球的質量＋得分物件下拉選單（兩個欄位，放在 .fields 裡） */
export function BallFields({ plan, setP }: { plan: ShotPlan; setP: (p: Partial<ShotPlan>) => void }) {
  // 質量剛好是某個得分物件就顯示它，自己改過質量就變回「自己填」
  const piece = GAME_PIECES_2026.find((p) => Math.abs(p.mass - plan.ballMass) < 1e-6)?.id ?? ''
  const pickPiece = (id: string) => {
    const p = GAME_PIECES_2026.find((x) => x.id === id)
    if (p) setP({ ballMass: p.mass })
  }
  return (
    <>
      <NumberField label={t('球的質量', 'Ball mass')} value={plan.ballMass} onChange={(x) => setP({ ballMass: x })} min={0.01} max={1} step={0.005} unit="kg" />
      <label className="f">
        {t('得分物件', 'Game piece')}
        <span className="inp">
          <select value={piece} onChange={(e) => pickPiece(e.target.value)} aria-label={t('得分物件', 'Game piece')}>
            <option value="">{t('自己填質量', 'Enter mass yourself')}</option>
            <optgroup label="FRC 2026 REBUILT">
              {GAME_PIECES_2026.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {t('（', ' (')}
                  {f(p.mass * 1000, 0)} g{t('）', ')')}
                </option>
              ))}
            </optgroup>
          </select>
        </span>
      </label>
    </>
  )
}

export function HubPreset({ setP }: { setP: (p: Partial<ShotPlan>) => void }) {
  return (
    <div className="fw-preset">
      <button className="btn small" type="button" onClick={() => setP(HUB_2026)}>
        {t('套用 2026 HUB 高度', 'Use the 2026 HUB height')}
      </button>
      <span className="small muted">
        {t(
          <>
          REBUILT 的 HUB：開口前緣離地 72 in（{f(HUB_2026.goalHeight, 2)} m），六角形開口寬 41.7 in（{f(HUB_2026.goalWidth, 2)} m）。目標距離照你站的位置自己填。
          </>,
          <>
            REBUILT HUB: the opening’s front edge is 72 in ({f(HUB_2026.goalHeight, 2)} m) above the floor and the hexagonal opening is 41.7 in ({f(HUB_2026.goalWidth, 2)} m) wide. Fill in the target distance for where you’re standing.
          </>,
        )}
      </span>
    </div>
  )
}

/** 目標距離從機器人哪裡量（下拉選單和「目標距離」的說明共用） */
export const FROM_LABEL: Record<DistanceFrom, string> = {
  pivot: t('砲台轉軸', 'Turret pivot'),
  center: t('機器人中心', 'Robot center'),
  bumper: t('保險桿前緣', 'Bumper front edge'),
}

/** 「目標距離」欄位的說明：從哪裡量到目標中心 */
export function distanceHint(plan: ShotPlan, moving = false) {
  const from = FROM_LABEL[plan.distanceFrom]
  return moving
    ? t(`第一發時，${from}到目標中心的水平距離`, `Horizontal distance from the ${from.toLowerCase()} to the target center at the first shot`)
    : t(`${from}到目標中心的水平距離`, `Horizontal distance from the ${from.toLowerCase()} to the target center`)
}

/**
 * 砲台的位置：轉軸高度、轉軸到出射點，和目標距離從機器人哪裡量。
 * 給 angle 時顯示那個砲台角度下出射點的高度和離目標多遠。
 */
export function TurretFields({ plan, setP, angle }: { plan: ShotPlan; setP: (p: Partial<ShotPlan>) => void; angle?: number }) {
  const from = plan.distanceFrom
  // 保險桿前緣在轉軸前面，填「轉軸在後面多少」比較直覺，存的時候變負的
  const behind = from === 'bumper'
  return (
    <>
      <div className="fields three">
        <NumberField label={t('砲台轉軸高度', 'Turret pivot height')} value={plan.height} onChange={(x) => setP({ height: x })} min={0} max={2} step={0.01} unit="m" hint={t('砲台轉動的那根軸離地多高', 'How high the turret’s pivot axle is above the floor')} />
        <NumberField label={t('轉軸到出射點', 'Pivot to release point')} value={plan.barrel} onChange={(x) => setP({ barrel: Math.max(0, x) })} min={0} max={1} step={0.01} unit="m" hint={t('球離開輪子的地方離轉軸多遠；0 = 當成從轉軸出去', 'How far from the pivot the ball leaves the wheel; 0 = treat it as leaving from the pivot')} />
        <label className="f">
          {t('目標距離從哪裡量', 'Target distance measured from')}
          <span className="inp">
            <select value={from} onChange={(e) => setP({ distanceFrom: e.target.value as DistanceFrom })} aria-label={t('目標距離從哪裡量', 'Target distance measured from')}>
              {(Object.keys(FROM_LABEL) as DistanceFrom[]).map((k) => (
                <option key={k} value={k}>
                  {FROM_LABEL[k]}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      {from !== 'pivot' && (
        <div className="fields three" style={{ marginTop: 12 }}>
          <NumberField
            label={behind ? t('轉軸在保險桿前緣後面', 'Pivot behind the bumper front') : t('轉軸在機器人中心前面', 'Pivot ahead of the robot center')}
            value={behind ? -plan.pivotAhead : plan.pivotAhead}
            onChange={(x) => setP({ pivotAhead: behind ? -x : x })}
            min={behind ? 0 : -1}
            max={1}
            step={0.01}
            unit="m"
            hint={behind ? t('水平距離，朝目標那一側的保險桿', 'Horizontal distance, from the bumper on the side facing the target') : t('朝目標的方向為正，在中心後面填負的', 'Positive toward the target; negative if behind the center')}
          />
        </div>
      )}
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        {t(
          <>
            先確認你填的目標距離是從機器人哪裡量的。用里程計（odometry）的位置算距離時，通常是<b>機器人中心</b>；拿捲尺量時，常常是從<b>保險桿</b>量。量的點不一樣，差的那段距離會直接變成落點的誤差。
          </>,
          <>
            First check where on the robot your target distance is measured from. If it comes from the odometry pose, it’s usually the <b>robot center</b>; with a tape measure it’s often from the <b>bumper</b>. If the point is different, that gap goes straight into where the ball lands.
          </>,
        )}
        {angle !== undefined &&
          t(
            ` 砲台角度 ${f(turretDeg(angle), 1)}° 時，出射點離地 ${f(releaseHeight(plan, angle), 2)} m，離目標 ${f(plan.goalDistance - releaseAhead(plan, angle), 2)} m。`,
            ` At a ${f(turretDeg(angle), 1)}° turret angle the release point is ${f(releaseHeight(plan, angle), 2)} m above the floor and ${f(plan.goalDistance - releaseAhead(plan, angle), 2)} m from the target.`,
          )}
      </p>
    </>
  )
}
