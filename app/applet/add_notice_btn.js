const fs = require("fs");
let lines = fs.readFileSync("src/components/MeetingCheckinModal.tsx", "utf8").split("\n");

// For parent meeting button (around line 2406)
const parentButtonIdx = lines.findIndex((l, idx) => idx > 2390 && idx < 2420 && l.includes("家長掃碼 QR / 網址"));
if (parentButtonIdx !== -1) {
  let endIdx = parentButtonIdx;
  while (endIdx < lines.length && !lines[endIdx].includes("</button>")) endIdx++;
  if (endIdx < lines.length) {
    const indent = lines[parentButtonIdx].match(/^(\s*)/)[1];
    const noticeBtn = [
      indent + '<button',
      indent + '  type="button"',
      indent + '  onClick={() => setActiveNoticeMeeting(meeting)}',
      indent + '  className="px-3 py-1.5 text-xs font-semibold text-emerald-950 bg-emerald-100/80 border border-emerald-300 rounded-lg hover:bg-emerald-200 inline-flex items-center gap-1.5 shadow-sm"',
      indent + '>',
      indent + '  <FileText className="w-3.5 h-3.5" />',
      indent + '  <span>列印 1/4 A4 通知單</span>',
      indent + '</button>'
    ];
    lines.splice(endIdx + 1, 0, "", ...noticeBtn);
    console.log("Inserted parent notice button at line", endIdx + 2);
  }
}

// For teacher meeting button (around line 4040)
const teacherButtonIdx = lines.findIndex((l, idx) => idx > 4020 && idx < 4060 && l.includes("會議掃碼 QR / 網址"));
if (teacherButtonIdx !== -1) {
  let endIdx = teacherButtonIdx;
  while (endIdx < lines.length && !lines[endIdx].includes("</button>")) endIdx++;
  if (endIdx < lines.length) {
    const indent = lines[teacherButtonIdx].match(/^(\s*)/)[1];
    const noticeBtn = [
      indent + '<button',
      indent + '  type="button"',
      indent + '  onClick={() => setActiveNoticeMeeting(meeting)}',
      indent + '  className="px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-[#1E3A8A]/10 border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/20 inline-flex items-center gap-1.5 shadow-sm"',
      indent + '>',
      indent + '  <FileText className="w-3.5 h-3.5" />',
      indent + '  <span>列印 1/4 A4 通知單</span>',
      indent + '</button>'
    ];
    lines.splice(endIdx + 1, 0, "", ...noticeBtn);
    console.log("Inserted teacher notice button at line", endIdx + 2);
  }
}

fs.writeFileSync("src/components/MeetingCheckinModal.tsx", lines.join("\n"), "utf8");
console.log("Successfully updated meeting checkin modal with notice buttons.");
