"""Presentation only; source and copied answer text remain unchanged."""
import re

def answer_markdown(text):
    return re.sub(r'!(?=\[)', '&#33;', text)
