## UniPi

##### User LEDS

There are 4 User LEDs on the device labeled X1 to X4. They give different feedback for debug purpose.

X2: Blinks if the device computer is running and working
X3: On if Socket connected, else off
X4: On if update of code is running, else off

## Test Socket

##### wsclient test tool usage

Use input params on start
`-d` debug enabled (more logs)
`-c <command>` command to send to unipi. Example: `-c lcoff` possible: lcon = 0% transparency, lcoff= 100% transparency
`-f <looppause>` lc dimming loop start with `<looppause>` as the pause for steps. Higher value -> slower dimming default: "-f 100"

## Socket

There are some commands that can be send from the client to the unipi via websocket. The Port of the Device is 8007. The IP can be checked in the startup log or in balena dashboard.

##### Digital In: new pin press

this message gets send from unipi via socket
`{"message":"digitalin","data":{"pinName":<pinname>}}`
`<pinname>` is the name of the pressed pin like the layout of unipi. for example `2.11`

##### Loop Control: start loop

start the loop with this command via socket
`{ command: "lcstart", value: <fadevalue> }`
`<fadevalue>` is the pause in ms between every dim steps. The Loop is 1000 steps per direction
Exampme: `{ command: "lcstart", value: 100 }` Time for dim up is 100 Seconds, Dim Down also 100 Seconds (100ms\*1000=100s)

##### Loop Control: stop loop

`{ command: "lcoff" }`
stops the loop timer and turns off the voltage on the LC Glass (gets non transparent)

##### Loop Response: Running Feedback ping

If the loop is running there is send a command every time the loop reaches the fully up point or fully down point
`{"message":"dimmerloop","data":{"loopRunning":true,"loopDirection":"up","loopTimeMs":100000}}`
`loopDirection: STRING` the direction the loop is going next. Can be "up" or "down"
`loopTimeMs: NUMBER` the time it will take till the loop reaches the next peak
