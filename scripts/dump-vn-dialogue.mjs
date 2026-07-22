import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  'components/vn/DialogueBox.tsx',
  'components/oc/OcVnDialogue.tsx',
  'components/pair/PairVnDialogue.tsx',
  'components/shared/VnDialogueChoices.tsx',
  'components/shared/VnActionChoices.tsx',
  'components/shared/useVnChoicePick.ts',
  'components/shared/VnCharFx.tsx',
  'components/shared/VnAutoPlayButton.tsx',
  'components/vn/VnChoicePanel.tsx',
  'components/vn/VnLocationLabel.tsx',
  'components/vn/CharacterSprite.tsx',
  'components/vn/VNEngine.tsx',
  'components/vn/useVNEngine.ts',
  'components/vn/types.ts',
  'components/vn/index.ts',
  'components/vn/VnFxLayer.tsx',
  'components/vn/BackgroundLayer.tsx',
  'components/vn/VnSceneClient.tsx',
  'components/vn/vn-engine.module.css',
  'components/shared/DialogueNodesEditor.tsx',
  'lib/hooks/useBalancedDialogueText.ts',
  'lib/shared/balanceDialogueText.ts',
  'lib/pair/dialogue.ts',
  'lib/vn/presence.ts',
  'lib/vn/motions.ts',
  'lib/vn/useVnAutoPlay.ts',
  'lib/vn/playLineVoice.ts',
  'lib/vn/vnSave.ts',
  'styles/shared/vn-action-choices.css',
  'styles/shared/vn-location.css',
  'styles/shared/vn-savebar.css',
  'styles/shared/dialogue-nodes-editor.css',
  'styles/vn-char-motions.css',
  'styles/oc-next-fixes.css',
  'app/vn-route.css',
  'app/oc-route.css',
  'app/pair-route.css',
  'src/oc/js/oc-rebuild.js',
  'src/oc/js/oc-dialogue-gallery-polish.js',
  'src/oc/styles/oc-rebuild.css',
  'src/oc/styles/oc-detail-v2.css',
  'src/oc/styles/oc-char-vn-fix.css',
  'src/oc/styles/oc-char-vn-form.css',
  'styles/pair/pair-cherry-detail.css',
];

const out = path.join(root, '_vn-dialogue-full-dump.txt');
let buf = `=== LAKEHOUSE VN DIALOGUE FULL DUMP ===\nGenerated: ${new Date().toISOString()}\n\n`;
const missing = [];

for (const rel of files) {
  const abs = path.join(root, rel);
  buf += `\n${'='.repeat(80)}\nFILE: ${rel}\n${'='.repeat(80)}\n`;
  if (fs.existsSync(abs)) {
    buf += fs.readFileSync(abs, 'utf8');
    if (!buf.endsWith('\n')) buf += '\n';
  } else {
    missing.push(rel);
    buf += '[MISSING]\n';
  }
}

// character types excerpt
const charPath = path.join(root, 'lib/types/character.ts');
if (fs.existsSync(charPath)) {
  const src = fs.readFileSync(charPath, 'utf8');
  const lines = src.split('\n');
  const pick = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/DialogueChoice|DialogueNode|PairVnStandPose|dialogueBySide|vnStandPos|vnLines|choiceMode/.test(l)) {
      const start = Math.max(0, i - 3);
      const end = Math.min(lines.length, i + 25);
      pick.push(...lines.slice(start, end));
      pick.push('---');
    }
  }
  buf += `\n${'='.repeat(80)}\nFILE: lib/types/character.ts (excerpt)\n${'='.repeat(80)}\n`;
  buf += [...new Set(pick)].join('\n') + '\n';
}

fs.writeFileSync(out, buf, 'utf8');
console.log(JSON.stringify({ out, bytes: fs.statSync(out).size, missing }, null, 2));
