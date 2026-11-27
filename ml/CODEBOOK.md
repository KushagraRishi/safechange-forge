# Hazard codebook

How to label one FDA recall event with a software root cause. Each event gets **one or more** of the 8 categories below, or `none` if no category fits.

**Label what the software does wrong (the failure), not the possible harm.** Many recalls end with "could lead to a delay in treatment" or "could result in serious injury". Ignore those endings. Read what actually goes wrong.

| Code | Category | Label it when the software... | Examples |
|---|---|---|---|
| `dose` | Wrong therapy amount | delivers, sets or calculates the wrong amount, rate or timing of a therapy: drug, insulin, infusion, radiation, energy, ventilation, stimulation. Too much, too little or none. | "may over infuse", "incorrect bolus calculation", "radiation delivered to the wrong location or dose", "ventilator delivers wrong tidal volume" |
| `info` | Wrong or missing information | shows, stores, prints or sends wrong, missing, mixed up or outdated clinical data: results, images, measurements, patient identity, reports. | "incorrect lab result displayed", "images assigned to the wrong patient", "measurement calculated incorrectly", "image artifacts", "report missing data" |
| `alarm` | Alarm or detection failure | fails to detect a dangerous condition, or its alarm or alert is missing, late, silent, wrong or false. | "may fail to detect air in line", "no occlusion alarm", "alarm volume too low", "false alarms", "warning not displayed" |
| `stop` | Loss of function | stops, freezes, crashes, reboots, hangs, fails to start, or becomes unavailable or unresponsive. | "system may freeze", "unexpected reboot", "pump may shut down", "application crashes", "unable to start a scan" |
| `comms` | Connectivity or data transfer | fails or corrupts communication, interfacing, synchronization or transfer between devices or systems (network, HL7, DICOM, Bluetooth, cloud, EHR). | "orders not transmitted to the EHR", "loss of Bluetooth connection", "DICOM transfer fails", "data not synchronized" |
| `security` | Security | has a cybersecurity vulnerability, or allows unauthorized access or control. | "vulnerability could allow an attacker", "unauthorized user may change settings" |
| `ui` | User interface or input | accepts a wrong entry, shows confusing or wrong labels, units or selections, or makes a use error likely through the screen or controls. | "allows entry of an incorrect unit", "wrong drug name selected from list", "button mislabeled", "decimal point not displayed" |
| `power` | Power or battery | mismanages battery or power: drains it, shows wrong charge, fails to switch power source, fails on low battery. | "battery drains faster than expected", "incorrect battery level shown" |

Rules:
1. Use as many codes as truly apply. A frozen screen that also hides an alarm is `stop` and `alarm`.
2. A wrong value used to set therapy is `dose`. A wrong value only shown to the user is `info`.
3. Detection failures (air, occlusion, disconnection, out of range readings) are `alarm`.
4. If the text is too vague to tell what fails (for example "a software anomaly was identified"), use `none`.
5. Do not guess from the device type alone. Use the words of the recall.
