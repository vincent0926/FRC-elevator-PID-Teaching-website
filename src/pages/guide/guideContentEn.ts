import type { Track } from '../../app/store'
import { GUIDE_ANCHOR, type GuideContent } from './guideContent'

/**
 * 使用說明的英文版，結構跟 guideContent.ts 的中文版一樣。
 * “…” 引用的按鈕、標題要跟英文畫面一致：guideContent.test.ts 也會檢查。
 */
export function guideContentEn(track: Track): GuideContent {
  const arm = track === 'arm'
  const thing = arm ? 'arm' : 'elevator'
  const pos = arm ? 'angle' : 'height'
  const slot = arm ? 'Custom' : 'Tuning suggestion'

  return {
    intro: `First time here? Follow the route below once; in about 30 minutes you’ll go from your ${thing}’s mechanism data to understanding the tuning advice. Each floor’s details are further down; expand them to read.`,

    start: [
      {
        floor: '1F',
        page: 'calc',
        text: arm
          ? 'Enter the arm’s mechanism data and look at the parameter card on the right; do the first two lessons to understand why kG is multiplied by cos θ.'
          : 'Enter the elevator’s mechanism data and look at the parameter card on the right; do the first two lessons to understand how kG and kV are calculated.',
      },
      {
        floor: '3F',
        page: 'sim',
        text: `Press “Play” to watch the ${thing} move, then drag the kG and kP sliders in “Tune it yourself” and see how the ${pos} curve and voltage change.`,
      },
      {
        floor: '2F',
        page: 'tune',
        text: 'In 3F press “Send to 2F tuning advice”, or use a sample log from “No log?”, and walk through steps 0 to 3.',
      },
      {
        floor: '4F',
        page: 'learn',
        text: 'Before going to the robot, check off every item in “Unit 0: prep before the robot”.',
      },
      {
        floor: 'Robot',
        page: 'tune',
        text: `Record a real log on the robot, import it in 2F, change one gain at a time, then record and check again until every metric on your ${thing} passes.`,
      },
    ],

    sections: [
      {
        id: GUIDE_ANCHOR.calc,
        page: 'calc',
        floor: '1F',
        title: 'Calculate gains',
        what: `Turn your ${thing}’s mechanism data into the numbers the controller uses: feedforward kG, kV, kA, a starting kP for feedback, and the Motion Magic velocity and acceleration limits. These are the “theory values”, and every adjustment starts from here.`,
        steps: arm
          ? [
              'On the left, enter the arm’s mechanism data: mass, length, center-of-mass position, end load, gear ratio, angle range, and whether the angle sensor is the TalonFX built-in encoder or a CANcoder.',
              'Change a number and the parameter card on the right recalculates immediately. The small tag next to each gain says where it comes from: calc, calc + measure, measure, tune, limit.',
              'kS defaults to 0; once you measure it with the 4F two-point method, you can enter it here.',
              'Work through the five lessons below: each has a goal, a fill-in exercise and a check question. Finishing all of them unlocks expert mode in 2F.',
              'Press “Send to sim” to take the theory values to 3F; to change things freely, press “Copy as custom and simulate”.',
            ]
          : [
              'On the left, enter the elevator’s mechanism data: motors, gear ratio, drum, travel and each stage’s mass.',
              'Change a number and the parameter card on the right recalculates immediately. The small tag next to each gain says where it comes from: calc, calc + measure, measure, tune, limit.',
              'kS defaults to 0; once you measure it with the 4F two-point method, you can enter it here.',
              'Work through the five lessons below: each has a goal, a fill-in exercise and a check question. Finishing all of them unlocks expert mode in 2F.',
              'Press “Send to sim” to take the theory values to 3F; to change things freely, press “Copy as custom and simulate”.',
              'Optional: “Choosing a gear ratio” compares how long a full move takes with different ratios; “Share this elevator” turns the mechanism data into a link for teammates.',
            ],
        look: arm
          ? [
              'Angles are always 0 = horizontal, up is positive, shown in degrees. kG is the horizontal value; the controller multiplies it by cos θ.',
              'Without a measured kS, top speed and acceleration are the “friction-free theoretical limit”; the real ones are lower.',
              'kP starts as a beginner value; tune it in 3F and 2F.',
            ]
          : [
              'Without a measured kS, top speed and acceleration are the “friction-free theoretical limit”; the real ones are lower.',
              'kP starts as a beginner value; tune it in 3F and 2F.',
              'Position is drum rope displacement, not the top stage height.',
            ],
        stuck: [
          ['I don’t get where the numbers come from', 'Follow the lessons. Wrong answers in the fill-in exercises tell you what went wrong, so don’t worry.'],
          ['Theory is far from the real robot', arm ? 'Re-measure the mass, center-of-mass position and gear ratio; theory is only as accurate as its inputs.' : 'Re-measure each stage’s mass, the gear ratio and the drum diameter; theory is only as accurate as its inputs.'],
        ],
      },
      {
        id: GUIDE_ANCHOR.sim,
        page: 'sim',
        floor: '3F',
        title: 'Simulate',
        what: 'See what the gains do in the sim before going to the robot. Changing numbers can’t break anything, so experiment freely.',
        steps: [
          `Pick the gain source at the top: ${arm ? 'Theory (from 1F) or Custom (your own)' : 'Theory (from 1F), Tuning suggestion (after applying in 2F) or Custom (your own)'}.`,
          `Set the start ${pos} and target ${pos}, then press “Play” to watch the ${thing} move. You can switch to slow motion (0.25×, 0.1×) or drag the timeline.`,
          'Right below the playback bar is “Tune it yourself”: drag a slider or type a number and the sim and animation update immediately. Dragging while on theory copies it to “Custom” and overlays the theory curve for comparison; “Reset all to theory” restores it in one click.',
          'The units above the sliders can switch to “Phoenix 6 (rps)”: kV becomes V/rps and cruise velocity becomes rps, so the numbers are exactly what goes into Slot0Configs and MotionMagicConfigs (same sim, just different units).',
          `Read the charts and metrics table below (${arm ? 'angle, following error, angular velocity, voltage, current' : 'position, following error, velocity, voltage, current'}).`,
          'To see what a problem looks like, load a deliberately wrong example from “Teaching scenarios”; beginners can go step by step with “Beginner: tune in order”.',
          'Once it’s close, press “Send to 2F tuning advice” so the site analyzes this run and tells you which gain to change first.',
        ],
        look: [
          `The dashed line is the profile (where the ${thing} should be) and the solid line is the actual. When they overlap, it’s tracking well.`,
          'Voltage chart: the green line is feedforward and the red line is feedback. With accurate feedforward the red line is almost 0; if it stays on one side, something in the feedforward is off.',
          'When current is pinned at the limit, the motor is already at full effort; tuning PID won’t help, so slow down Motion Magic.',
          'The pass criteria are for teaching, not official FRC standards; the sim is a teaching model, not a numerical reproduction of the firmware. Real numbers come from testing on the robot.',
        ],
        stuck: [
          ['I moved a slider and the charts look about the same', 'That gain has little effect here. Push kG or kP further and see which line moves. Change one at a time so you know what caused it.'],
          ['I want to get back to where I started', arm ? 'Press “Reset all to theory”.' : 'Press “Reset all to theory”; when you find a good set in the gains section below, press “Set as baseline”, then you can always press “Reset to baseline” to get back.'],
          ['The screen went blank, or says “Something went wrong on this page”', 'First press “Show this page again”; if it keeps happening, press Ctrl+F5 to reload and send a screenshot of the error message to whoever maintains the site.'],
        ],
      },
      {
        id: GUIDE_ANCHOR.tune,
        page: 'tune',
        floor: '2F',
        title: 'Tuning advice',
        what: 'Give the site a log: it first checks whether the data is usable, then tells you which gain the problem is in and how much to change it. One problem at a time.',
        steps: [
          'Get data: drop in a .wpilog from the robot (recorded with AdvantageKit); without a log, generate a sample in “No log?” on the right, or press “Send to 2F tuning advice” in 3F.',
          'The first import needs the field mapping confirmed (the site guesses first); press “Read and check”. After that the same fields are applied automatically.',
          'Step 0 data checks: any ✕ means the log can’t be analyzed; fix it as described and record again. ! is a warning and you can continue.',
          'Step 1 find the problem: look at the charts, pick the top-priority problem yourself and write a reason (wrong picks get hints). After finishing the 1F lessons you can turn on “Expert mode” to see the result directly.',
          `Step 2 fix one problem: press “Apply” to save the suggestion as “${slot}”, then press “Preview in sim” to see the change in 3F.`,
          'Step 3 verify on the robot: put that one gain into the robot code, record another log doing the same motion, import it and see whether the problem is gone.',
          'The step bar at the top (from “Import & check” to “Verify on the robot”) is clickable and scrolls to that step; if the step isn’t there yet, it tells you what to do first.',
        ],
        look: [
          'Pick “Gains on the robot at the time” correctly: the advice is one change from that set. Data sent from 3F uses the sim’s gains automatically.',
          'Data sent from 3F is simulated, not a robot log; use it to practice reading charts and advice, and trust numbers from the real robot.',
          'The site only advises. The robot code is the source of truth for gains; make the change in code yourself.',
        ],
        stuck: [
          ['Step 0 has a ✕', 'Voltage saturation: slow down Motion Magic. Current limit: the motor is already at full effort, so tuning PID won’t help; slow down Motion Magic or check whether the mechanism is too heavy or binding. Following error too large: check direction, units and whether it’s stuck first. Not enough excitation: record a section moving up and down.'],
          ['Clicking steps 1, 2, 3 only shows a note', 'That step isn’t there yet: step 1 needs step 0 to pass; step 2 needs the right pick in step 1 (or expert mode); step 3 needs “Apply” in step 2.'],
          ['The fields don’t match up', arm ? 'Pick them by hand in the field mapping table. Angles must be in radians with 0 = horizontal (the example code’s ArmIO does this).' : 'Pick them by hand in the field mapping table; fix wrong units with the scale.'],
        ],
      },
      {
        id: GUIDE_ANCHOR.learn,
        page: 'learn',
        floor: '4F',
        title: 'Real-robot lessons',
        what: 'Tuning advice needs good robot data, and the data has to be recorded safely. This floor covers pre-robot checks, how to record logs, and how to measure kS and kG.',
        steps: arm
          ? [
              'First check off every item in “Unit 0: prep before the robot” (direction, zero at horizontal, soft limits, it drops when power is cut). Always do this before making the arm move.',
              '“Measure kS, kG”: measured at horizontal without SysId; kS can be entered back in 1F.',
              'Unit 1 recording logs, unit 2 SysId and unit 3 common arm pitfalls can be read any time.',
              'Unit 4 final check: for a log you haven’t seen, decide what happened and what to change first; the safety question must pass.',
            ]
          : [
              'First check off every item in “Unit 0: prep before the robot”. Always do this before recording logs or running SysId.',
              '“Measure kS, kG”: measured without SysId; kS can be entered back in 1F.',
              'Unit 1 recording logs with AdvantageKit, unit 2 measuring with SysId and unit 3 common pitfalls can be read any time.',
              'Unit 4 final check: for a log you haven’t seen, decide what happened and what to change first; the safety question must pass.',
            ],
        look: ['Someone must always be watching Disable on the robot. The site is not an e-stop; always use the Driver Station.', 'Each unit ends with 3 check questions so you know whether you understood it.'],
        stuck: [['I don’t know where to start', 'Read unit 0, then unit 1. When recording logs, use unit 1’s field names so 2F can match them automatically.']],
      },
    ],

    terms: [
      { name: 'kS', text: 'Fixed voltage to overcome static friction. Small, 0 by default; too big and it jitters near the target.' },
      { name: 'kG', text: arm ? 'Voltage to cancel gravity. Largest with the arm horizontal, smaller the more upright it is (× cos θ). Too small and it droops; too big and it drifts up.' : 'Voltage to cancel gravity, constant for an elevator. Too small and it sags after stopping; too big and it drifts up.' },
      { name: 'kV', text: 'Volts per unit of velocity. Too small lags the profile; too big runs ahead.' },
      { name: 'kA', text: 'Extra voltage while accelerating and decelerating.' },
      { name: 'kP', text: 'Pushes harder the bigger the error. Too small misses the target; too big oscillates.' },
      { name: 'kI', text: 'Slowly makes up accumulated error. Usually 0; too big and it swings back and forth.' },
      { name: 'kD', text: 'Damps overshoot and oscillation. Too big amplifies noise and jitters.' },
      { name: 'Motion Magic', text: `Moves the ${thing} along a trapezoidal profile (accelerate → cruise → decelerate) instead of jumping to the target. Cruise velocity and acceleration are its two limits.` },
      { name: 'Feedforward and feedback', text: 'Feedforward is voltage given ahead of time from the plan (kS, kG, kV, kA); feedback is added after seeing the error (kP, kI, kD). With accurate feedforward, feedback has almost nothing to do.' },
    ],

    faq: [
      {
        q: 'Where is my data stored?',
        a: `Only in this browser on this computer (mechanism data, custom gains, lesson progress…). It’s gone if you switch computers or browsers or clear site data. The elevator and arm are saved separately and don’t affect each other.${arm ? '' : ' The elevator’s mechanism data can travel with you through the 1F “Share this elevator” link.'}`,
      },
      {
        q: 'The page still looks old after an update?',
        a: 'The site is cached; press Ctrl+F5 to force a reload. On a phone, close the tab and open it again.',
      },
      {
        q: 'Does it work offline?',
        a: 'Yes, after the first visit. You’ll be prompted to update when there’s a new version.',
      },
      {
        q: 'How do the gains get onto the robot?',
        a: 'The site never writes to the robot or connects to it. Following the 1F parameter card and 2F advice, change the numbers in your code yourself; the code is the final source of truth for gains. Example code is in the project’s robot-example.',
      },
      {
        q: 'The sim and the real robot are very different?',
        a: arm ? 'The sim is a simplified teaching model. Trust the real robot; import robot logs into 2F for advice.' : 'The sim is a simplified teaching model. 3F has “Model calibration” to calibrate gravity, kV, equivalent mass and friction from a robot log; in the end, trust the real robot.',
      },
      {
        q: 'Do I lose data when switching mechanisms (elevator / arm / flywheel shooter)?',
        a: 'No, each mechanism is saved separately. Use “Switch mechanism” at the top left to switch.',
      },
      {
        q: 'Can I use it on a phone?',
        a: 'Yes, the layout adjusts automatically, but charts and sliders are easier on a computer.',
      },
      {
        q: 'Can the site act as an e-stop?',
        a: 'No. The site doesn’t connect to the robot; always use the Driver Station to stop.',
      },
    ],
  }
}
