# Design Decisions — Minewalker

### Endless has no win
**Chose:** Keep digging and track deepest cleared over a clearable “win” state  
**Reason:** Endless is a score-building vein, not another classic field; milestones can layer on later

### Dig and flag follow facing
**Chose:** Target the cell ahead of the miner over camera-look aiming (for now)  
**Reason:** Reinforces “body in the board”; camera-aim redesign is deferred

### Deep-links jump into play
**Chose:** Skip cover and start a run (default beginner) over landing on Shift Desk  
**Reason:** Castle Gate / direct links should put the player in the mine immediately

### Training is not a level
**Chose:** Separate onboarding yard from the four Shift Desk levels  
**Reason:** Practice walking and reading numbers before a random field

### Scores stay local
**Chose:** Browser local storage over accounts / cloud  
**Reason:** Keep progression simple and private for the current product shape

### Rules stay engine-free
**Chose:** Pure mine rules mirrored by the 3D view over embedding rules in the scene  
**Reason:** Clear ownership, easier reasoning, presentation can change without rewriting logic
