#!/usr/bin/env python3
"""
Human-Check Protocol Validator
Analyzes copy for robotic signals and human writing patterns.

Based on the Human-Check Protocol defined in copywriter-skill/SKILL.md

Usage:
    python human_check.py "Your copy text here"
    python human_check.py --file path/to/copy.txt
    cat copy.txt | python human_check.py --stdin
"""

import re
import sys
import argparse
from typing import Dict, List, Tuple


# ============================================================================
# CONFIGURATION - Based on SKILL.md Human-Check Protocol
# ============================================================================

BANNED_WORDS = [
    # AI Slop
    "unlock", "seamlessly", "leverage", "bottleneck", "game-changer",
    "dive into", "delve", "robust", "holistic", "landscape", "navigate",
    "synergy", "best practices", "ecosystem", "at scale", "move the needle",
    "low-hanging fruit", "cutting-edge", "revolutionary", "transform",
    "empower", "streamline", "optimize", "utilize", "facilitate",
    
    # Corporate speak
    "synergize", "ideate", "learnings", "cadence", "bandwidth",
    "circle back", "touch base", "deep dive", "paradigm shift",
    
    # Overused X phrases
    "here's the kicker", "here's the brutal truth", "let that sink in",
    "read that again", "this is huge",
]

BANNED_OPENERS = [
    "in today's world",
    "have you ever wondered",
    "it's no secret",
    "at the end of the day",
    "in this day and age",
    "it goes without saying",
    "needless to say",
]

BANNED_CONSTRUCTIONS = [
    ("in order to", "to"),
    ("due to the fact that", "because"),
    ("it is important to note", "note:"),
    ("it should be noted that", "note:"),
    ("the fact that", "[remove]"),
    ("in the event that", "if"),
    ("at this point in time", "now"),
    ("for the purpose of", "to"),
]

# Thresholds
MIN_CONTRACTION_RATIO = 0.3  # At least 30% of sentences should have contractions
MAX_AVG_SENTENCE_LENGTH = 25  # Words per sentence
MIN_SENTENCE_LENGTH_VARIANCE = 5  # Standard deviation in sentence length
MIN_SHORT_SENTENCES_RATIO = 0.15  # At least 15% of sentences under 5 words


# ============================================================================
# ANALYSIS FUNCTIONS
# ============================================================================

def split_sentences(text: str) -> List[str]:
    """Split text into sentences."""
    # Handle common abbreviations
    text = re.sub(r'\b(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|etc|vs|e\.g|i\.e)\.', r'\1<PERIOD>', text)
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip().replace('<PERIOD>', '.') for s in sentences if s.strip()]
    return sentences


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split())


def check_banned_words(text: str) -> List[str]:
    """Find banned words/phrases in text."""
    text_lower = text.lower()
    found = []
    for word in BANNED_WORDS:
        if word.lower() in text_lower:
            found.append(word)
    return found


def check_banned_openers(text: str) -> List[str]:
    """Check if text starts with banned openers."""
    text_lower = text.lower().strip()
    found = []
    for opener in BANNED_OPENERS:
        if text_lower.startswith(opener.lower()):
            found.append(opener)
    return found


def check_wordy_constructions(text: str) -> List[Tuple[str, str]]:
    """Find wordy constructions that should be simplified."""
    text_lower = text.lower()
    found = []
    for wordy, simple in BANNED_CONSTRUCTIONS:
        if wordy.lower() in text_lower:
            found.append((wordy, simple))
    return found


def check_contractions(sentences: List[str]) -> Tuple[int, int, float]:
    """Count sentences with contractions."""
    contraction_pattern = r"\b(don't|won't|can't|couldn't|wouldn't|shouldn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|doesn't|didn't|you're|we're|they're|I'm|he's|she's|it's|that's|there's|here's|what's|who's|let's|I'll|you'll|we'll|they'll|I've|you've|we've|they've|I'd|you'd|we'd|they'd|ain't)\b"
    
    with_contractions = 0
    for sentence in sentences:
        if re.search(contraction_pattern, sentence, re.IGNORECASE):
            with_contractions += 1
    
    total = len(sentences) if sentences else 1
    ratio = with_contractions / total
    return with_contractions, total, ratio


def check_sentence_length_variance(sentences: List[str]) -> Dict:
    """Analyze sentence length patterns."""
    if not sentences:
        return {"avg": 0, "min": 0, "max": 0, "std": 0, "short_ratio": 0}
    
    lengths = [count_words(s) for s in sentences]
    avg = sum(lengths) / len(lengths)
    min_len = min(lengths)
    max_len = max(lengths)
    
    # Standard deviation
    variance = sum((l - avg) ** 2 for l in lengths) / len(lengths)
    std = variance ** 0.5
    
    # Short sentences (under 5 words)
    short_count = sum(1 for l in lengths if l < 5)
    short_ratio = short_count / len(lengths)
    
    return {
        "avg": round(avg, 1),
        "min": min_len,
        "max": max_len,
        "std": round(std, 1),
        "short_ratio": round(short_ratio, 2),
        "lengths": lengths,
    }


def check_passive_voice(text: str) -> List[str]:
    """Detect potential passive voice constructions."""
    # Simple heuristic: "was/were/is/are/been + past participle"
    passive_pattern = r'\b(was|were|is|are|been|being|be)\s+(\w+ed|written|done|made|taken|given|shown|known|seen)\b'
    matches = re.findall(passive_pattern, text, re.IGNORECASE)
    return [f"{m[0]} {m[1]}" for m in matches]


def check_em_dashes_semicolons(text: str) -> Dict:
    """Count banned punctuation."""
    em_dashes = text.count('—') + text.count('--')
    semicolons = text.count(';')
    return {"em_dashes": em_dashes, "semicolons": semicolons}


def check_first_person(text: str) -> bool:
    """Check if text uses first person."""
    first_person_pattern = r'\b(I|I\'m|I\'ve|I\'ll|I\'d|my|mine|we|we\'re|we\'ve|we\'ll|our|ours)\b'
    return bool(re.search(first_person_pattern, text, re.IGNORECASE))


def check_specificity(text: str) -> Dict:
    """Check for specific numbers and concrete details."""
    # Numbers (not just "one", "two", etc.)
    number_pattern = r'\b\d+(?:,\d{3})*(?:\.\d+)?%?\b'
    numbers = re.findall(number_pattern, text)
    
    # Dollar amounts
    dollar_pattern = r'\$\d+(?:,\d{3})*(?:\.\d+)?[KMB]?'
    dollars = re.findall(dollar_pattern, text)
    
    # Time references
    time_pattern = r'\b\d+\s*(?:minutes?|hours?|days?|weeks?|months?|years?)\b'
    times = re.findall(time_pattern, text, re.IGNORECASE)
    
    return {
        "numbers": numbers,
        "dollar_amounts": dollars,
        "time_references": times,
        "total_specifics": len(numbers) + len(dollars) + len(times),
    }


# ============================================================================
# SCORING
# ============================================================================

def calculate_score(results: Dict) -> Tuple[int, List[str]]:
    """Calculate overall human-ness score (1-10) with specific issues."""
    score = 10
    issues = []
    
    # Banned words (-1 per word, max -3)
    if results["banned_words"]:
        penalty = min(len(results["banned_words"]), 3)
        score -= penalty
        issues.append(f"Banned words found: {', '.join(results['banned_words'][:5])}")
    
    # Banned openers (-2)
    if results["banned_openers"]:
        score -= 2
        issues.append(f"Banned opener: {results['banned_openers'][0]}")
    
    # Wordy constructions (-0.5 each, max -2)
    if results["wordy_constructions"]:
        penalty = min(len(results["wordy_constructions"]) * 0.5, 2)
        score -= penalty
        issues.append(f"Wordy constructions: {len(results['wordy_constructions'])} found")
    
    # Low contraction ratio (-2)
    if results["contraction_ratio"] < MIN_CONTRACTION_RATIO:
        score -= 2
        issues.append(f"Low contraction usage: {results['contraction_ratio']:.0%} (target: >{MIN_CONTRACTION_RATIO:.0%})")
    
    # Low sentence variance (-1)
    if results["sentence_stats"]["std"] < MIN_SENTENCE_LENGTH_VARIANCE:
        score -= 1
        issues.append(f"Sentences too uniform: std={results['sentence_stats']['std']} (target: >{MIN_SENTENCE_LENGTH_VARIANCE})")
    
    # No short sentences (-1)
    if results["sentence_stats"]["short_ratio"] < MIN_SHORT_SENTENCES_RATIO:
        score -= 1
        issues.append(f"Not enough short sentences: {results['sentence_stats']['short_ratio']:.0%} (target: >{MIN_SHORT_SENTENCES_RATIO:.0%})")
    
    # Too many passive constructions (-0.5 each, max -1.5)
    if len(results["passive_voice"]) > 2:
        penalty = min((len(results["passive_voice"]) - 2) * 0.5, 1.5)
        score -= penalty
        issues.append(f"Potential passive voice: {len(results['passive_voice'])} instances")
    
    # Em-dashes or semicolons (-1 each type)
    if results["punctuation"]["em_dashes"] > 0:
        score -= 1
        issues.append(f"Em-dashes found: {results['punctuation']['em_dashes']}")
    if results["punctuation"]["semicolons"] > 0:
        score -= 1
        issues.append(f"Semicolons found: {results['punctuation']['semicolons']}")
    
    # No first person (-1)
    if not results["uses_first_person"]:
        score -= 1
        issues.append("No first-person voice detected")
    
    # No specifics (-1)
    if results["specificity"]["total_specifics"] == 0:
        score -= 1
        issues.append("No specific numbers, amounts, or timeframes")
    
    return max(1, round(score)), issues


# ============================================================================
# MAIN ANALYSIS
# ============================================================================

def analyze_copy(text: str) -> Dict:
    """Run full human-check analysis on copy."""
    sentences = split_sentences(text)
    
    # Run all checks
    contraction_count, sentence_count, contraction_ratio = check_contractions(sentences)
    sentence_stats = check_sentence_length_variance(sentences)
    
    results = {
        "word_count": count_words(text),
        "sentence_count": len(sentences),
        "banned_words": check_banned_words(text),
        "banned_openers": check_banned_openers(text),
        "wordy_constructions": check_wordy_constructions(text),
        "contraction_count": contraction_count,
        "contraction_ratio": contraction_ratio,
        "sentence_stats": sentence_stats,
        "passive_voice": check_passive_voice(text),
        "punctuation": check_em_dashes_semicolons(text),
        "uses_first_person": check_first_person(text),
        "specificity": check_specificity(text),
    }
    
    score, issues = calculate_score(results)
    results["score"] = score
    results["issues"] = issues
    
    return results


def format_report(results: Dict) -> str:
    """Format analysis results as readable report."""
    lines = []
    lines.append("=" * 60)
    lines.append("HUMAN-CHECK PROTOCOL REPORT")
    lines.append("=" * 60)
    lines.append("")
    
    # Score
    score = results["score"]
    if score >= 8:
        verdict = "✅ PASS - Ready to publish"
    elif score >= 6:
        verdict = "⚠️  NEEDS WORK - Review issues below"
    else:
        verdict = "❌ FAIL - Significant rewrites needed"
    
    lines.append(f"SCORE: {score}/10 - {verdict}")
    lines.append("")
    
    # Issues
    if results["issues"]:
        lines.append("ISSUES FOUND:")
        for issue in results["issues"]:
            lines.append(f"  • {issue}")
        lines.append("")
    
    # Stats
    lines.append("STATS:")
    lines.append(f"  Words: {results['word_count']}")
    lines.append(f"  Sentences: {results['sentence_count']}")
    lines.append(f"  Contractions: {results['contraction_count']}/{results['sentence_count']} sentences ({results['contraction_ratio']:.0%})")
    lines.append(f"  Sentence length: avg={results['sentence_stats']['avg']}, min={results['sentence_stats']['min']}, max={results['sentence_stats']['max']}")
    lines.append(f"  Length variance (std): {results['sentence_stats']['std']}")
    lines.append(f"  Short sentences (<5 words): {results['sentence_stats']['short_ratio']:.0%}")
    lines.append(f"  First person: {'Yes' if results['uses_first_person'] else 'No'}")
    lines.append(f"  Specific numbers/amounts: {results['specificity']['total_specifics']}")
    lines.append("")
    
    # Banned elements found
    if results["banned_words"]:
        lines.append("BANNED WORDS FOUND:")
        for word in results["banned_words"]:
            lines.append(f"  • \"{word}\"")
        lines.append("")
    
    if results["wordy_constructions"]:
        lines.append("WORDY CONSTRUCTIONS (simplify):")
        for wordy, simple in results["wordy_constructions"]:
            lines.append(f"  • \"{wordy}\" → \"{simple}\"")
        lines.append("")
    
    if results["passive_voice"]:
        lines.append("POTENTIAL PASSIVE VOICE:")
        for phrase in results["passive_voice"][:5]:
            lines.append(f"  • \"{phrase}\"")
        lines.append("")
    
    lines.append("=" * 60)
    
    return "\n".join(lines)


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Analyze copy for robotic signals using the Human-Check Protocol"
    )
    parser.add_argument("text", nargs="?", help="Copy text to analyze")
    parser.add_argument("--file", "-f", help="Path to file containing copy")
    parser.add_argument("--stdin", action="store_true", help="Read from stdin")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    args = parser.parse_args()
    
    # Get input text
    if args.stdin:
        text = sys.stdin.read()
    elif args.file:
        with open(args.file, 'r') as f:
            text = f.read()
    elif args.text:
        text = args.text
    else:
        parser.print_help()
        sys.exit(1)
    
    # Analyze
    results = analyze_copy(text)
    
    # Output
    if args.json:
        import json
        # Remove non-serializable items
        output = {k: v for k, v in results.items() if k != "sentence_stats" or k == "sentence_stats"}
        print(json.dumps(results, indent=2, default=str))
    else:
        print(format_report(results))
    
    # Exit code based on score
    sys.exit(0 if results["score"] >= 8 else 1)


if __name__ == "__main__":
    main()
