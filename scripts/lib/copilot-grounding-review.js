// Diagnostic screening for the retained synthetic workloads, never an answer
// validator or runtime filter. A flag needs human review (negated/quoted claims
// can match); no flags cannot establish grounding or complete source coverage.
export function screenGrounding(answer) {
 const patterns={
  precipitation_absence:/\bno (?:rain|precipitation)\b|\b(?:rain|precipitation) is not (?:expected|forecast)/i,
  assignment_absence:/\bno (?:incident )?commander (?:is |has been )?assigned\b|\b(?:incident )?commander is (?:not |un)assigned\b/i,
  alert_absence:/\b(?:no|zero) active alerts\b/i,
  unsupported_reassurance:/\bno (?:immediate|significant|urgent) (?:risk|threat|hazard|safety|health|operational|action)|\b(?:safe operations|stable and non-emergency)\b/i,
 }
 return {manual_review_required:true,word_count:answer.trim()?answer.trim().split(/\s+/).length:0,
  flags:Object.entries(patterns).filter(([,pattern])=>pattern.test(answer)).map(([id])=>id)}
}
