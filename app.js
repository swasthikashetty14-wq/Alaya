import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";

const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), ctx = canvas.getContext("2d");
const stage = $("cameraStage");
const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]];
const poses = {
  mountain: {name:"Mountain pose", tip:"Stand with feet beneath hips and let your shoulders soften.", targets:{arms:170, leftLeg:175,rightLeg:175, torso:0}},
  tree: {name:"Tree pose", tip:"Press one foot into the standing leg. Keep your hips steady and gaze softly ahead.", targets:{arms:155,leftLeg:160,rightLeg:160, torso:0}},
  warrior: {name:"Warrior II", tip:"Bend your front knee, reach through both arms, and keep your chest open.", targets:{arms:175,leftLeg:115,rightLeg:165,torso:0}}
};
let landmarker, stream, activePose="mountain", running=false, startAt=0, holdStart=0, holdSeconds=0, lastFrame=-1, fpsGate=0, score=0, checkin=0;

function setStatus(text,on=false){$("statusPill").querySelector("span").textContent=text;$("statusPill").classList.toggle("on",on)}
function toast(message){const el=$("toast");el.textContent=message;el.classList.remove("hidden");setTimeout(()=>el.classList.add("hidden"),2600)}
function angle(a,b,c){const r1={x:a.x-b.x,y:a.y-b.y},r2={x:c.x-b.x,y:c.y-b.y};const dot=r1.x*r2.x+r1.y*r2.y, mag=Math.hypot(r1.x,r1.y)*Math.hypot(r2.x,r2.y);return Math.acos(Math.max(-1,Math.min(1,dot/(mag||1))))*180/Math.PI}
function avg(a,b){return(a+b)/2}
function calcScore(lm){
  const visible=[11,12,13,14,15,16,23,24,25,26,27,28].filter(i=>(lm[i].visibility??1)>.45);const confidence=visible.length/12;
  if(confidence<.58)return {value:0,confidence,parts:[]};
  const sh=avg(lm[11].y,lm[12].y), hip=avg(lm[23].y,lm[24].y);const torso=Math.abs(Math.atan2(avg(lm[11].x-lm[23].x,lm[12].x-lm[24].x),Math.max(.001,Math.abs(hip-sh))))*180/Math.PI;
  const arms=angle(lm[13],lm[11],lm[23]);
  const leftLeg=angle(lm[23],lm[25],lm[27]),rightLeg=angle(lm[24],lm[26],lm[28]);
  let measures;
  if(activePose==="mountain")measures=[[arms,poses.mountain.targets.arms,1],[leftLeg,175,1],[rightLeg,175,1],[torso,0,1]];
  else if(activePose==="warrior"){
    const bend=Math.min(leftLeg,rightLeg), straight=Math.max(leftLeg,rightLeg);
    measures=[[Math.min(arms,angle(lm[14],lm[12],lm[24])),175,1],[bend,115,1.1],[straight,165,1],[torso,0,.8]];
  } else {
    const footUp=(lm[27].y<lm[25].y-.035)||(lm[28].y<lm[26].y-.035);
    measures=[[arms,155,.8],[leftLeg,160,1],[rightLeg,160,1],[torso,0,.8]];
    if(!footUp) measures.push([0,1,2.2]);
  }
  const total=measures.reduce((sum,[v,t,w])=>sum+w,0);const penalty=measures.reduce((sum,[v,t,w])=>sum+Math.min(1,Math.abs(v-t)/55)*w,0)/total;
  return {value:Math.round(Math.max(0,100*(1-penalty))*(.55+.45*confidence)),confidence,parts:[arms,leftLeg,rightLeg,torso]};
}
function draw(lm){const w=canvas.width=video.videoWidth,h=canvas.height=video.videoHeight;ctx.clearRect(0,0,w,h);ctx.lineWidth=Math.max(2,w/260);ctx.lineCap="round";ctx.strokeStyle="rgba(234,247,222,.88)";
  for(const [a,b] of connections){if((lm[a].visibility??1)<.35||(lm[b].visibility??1)<.35)continue;ctx.beginPath();ctx.moveTo(lm[a].x*w,lm[a].y*h);ctx.lineTo(lm[b].x*w,lm[b].y*h);ctx.stroke()}
  lm.forEach((p,i)=>{if((p.visibility??1)<.35)return;const radius=i>=11?Math.max(3,w/125):Math.max(2,w/180);ctx.beginPath();ctx.arc(p.x*w,p.y*h,radius,0,Math.PI*2);ctx.fillStyle=[11,12,23,24,27,28].includes(i)?"#e9b96c":"#fcfff5";ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle="#547b5a";ctx.stroke()});
}
function updateUI(result,now){
  if(result.value>0){score=Math.round(score*.42+result.value*.58);$("scoreValue").textContent=score;$("scoreMeter").style.width=score+"%";$("alignmentValue").textContent=score+"%";$("scoreCaption").textContent=score>82?"FEELING ALIGNED":score>55?"FINDING YOUR FLOW":"KEEP EXPLORING";$("scoreMessage").textContent=score>82?"Lovely steadiness. Keep breathing.":score>55?"Nice work. Settle into the pose.":"Try the movement at a comfortable pace.";
    const good=score>=65;if(good){if(!holdStart)holdStart=now;holdSeconds=Math.floor((now-holdStart)/1000);$("holdBadge").classList.remove("hidden");$("holdTimer").textContent=holdSeconds+"s"}else{holdStart=0;holdSeconds=0;$("holdBadge").classList.add("hidden")}
  }else{$("scoreMessage").textContent="Step back so your head, hands and feet fit in view.";$("scoreCaption").textContent="FIND YOUR FRAME";holdStart=0;$("holdBadge").classList.add("hidden")}
  if(running){const secs=Math.floor((now-startAt)/1000);$("durationValue").textContent=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,"0")}`}
}
async function setupModel(){if(landmarker)return landmarker;setStatus("Loading pose model");const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");const base={modelAssetPath:"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"};const options={runningMode:"VIDEO",numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5};try{landmarker=await PoseLandmarker.createFromOptions(vision,{...options,baseOptions:{...base,delegate:"GPU"}})}catch(error){console.warn("GPU delegate unavailable; retrying with CPU",error);landmarker=await PoseLandmarker.createFromOptions(vision,{...options,baseOptions:base})}return landmarker}
async function start(){try{$("startButton").disabled=true;$("cameraMessage").textContent="Starting your camera…";await setupModel();stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:false});video.srcObject=stream;await new Promise(resolve=>video.onloadedmetadata=resolve);await video.play();stage.classList.add("active");$("placeholder").classList.add("hidden");$("stageHint").classList.remove("hidden");$("startButton").classList.add("hidden");$("stopButton").classList.remove("hidden");$("stageTitle").textContent=poses[activePose].name;$("cameraMessage").textContent="Keep your whole body in frame and move comfortably.";setStatus("Camera on",true);running=true;startAt=performance.now();score=0;loop();}catch(err){console.error(err);setStatus("Camera unavailable");$("cameraMessage").textContent=err.name==="NotAllowedError"?"Camera access was blocked. Allow it in your browser’s site settings, then try again.":"Could not start camera. Use localhost or HTTPS and check that a camera is connected.";$("startButton").disabled=false;toast("Camera could not start. Check browser permissions.")}}
function stop(){running=false;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;ctx.clearRect(0,0,canvas.width,canvas.height);stage.classList.remove("active");$("placeholder").classList.remove("hidden");$("startButton").classList.remove("hidden");$("stopButton").classList.add("hidden");$("holdBadge").classList.add("hidden");$("startButton").disabled=false;setStatus("Camera off");$("stageTitle").textContent="Ready when you are";$("cameraMessage").textContent="Allow camera access when your browser asks.";$("scoreValue").textContent="--";$("alignmentValue").textContent="—";$("scoreCaption").textContent="WAITING";$("scoreMessage").textContent="Start the camera to begin your practice.";$("scoreMeter").style.width="0";$("durationValue").textContent="0:00"}
function loop(){if(!running)return;const now=performance.now();if(video.currentTime!==lastFrame&&now-fpsGate>60){lastFrame=video.currentTime;fpsGate=now;try{const res=landmarker.detectForVideo(video,now);const lm=res.landmarks?.[0];if(lm){draw(lm);updateUI(calcScore(lm),now)}else updateUI({value:0,confidence:0},now)}catch(e){console.error(e)}}requestAnimationFrame(loop)}
document.querySelectorAll(".pose-option").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".pose-option").forEach(b=>b.classList.remove("selected"));btn.classList.add("selected");activePose=btn.dataset.pose;$("stageTitle").textContent=running?poses[activePose].name:"Ready when you are";$("tipText").textContent=poses[activePose].tip;score=0;holdStart=0;$("holdBadge").classList.add("hidden")}));
$("startButton").addEventListener("click",start);$("stopButton").addEventListener("click",stop);
$("helpButton").addEventListener("click",()=>$("helpDialog").showModal());$("closeHelp").addEventListener("click",()=>$("helpDialog").close());$("gotIt").addEventListener("click",()=>$("helpDialog").close());
$("checkinButton").addEventListener("click",()=>{const moods=["How are you feeling right now?","A little calmer? Take a slow breath.","Notice one thing your body did well.","What would feel kind to yourself next?"];checkin=(checkin+1)%moods.length;$("wellnessText").textContent=moods[checkin]});
window.addEventListener("beforeunload",()=>stream?.getTracks().forEach(t=>t.stop()));
