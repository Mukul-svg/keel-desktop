use pulldown_cmark::{html, CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use syntect::easy::HighlightLines;
use syntect::highlighting::{ThemeSet, Theme};
use syntect::html::{styled_line_to_highlighted_html, IncludeBackground};
use syntect::parsing::SyntaxSet;
use std::sync::OnceLock;

static SYNTAX_SET: OnceLock<SyntaxSet> = OnceLock::new();
static HIGHLIGHT_THEME: OnceLock<Theme> = OnceLock::new();

fn get_syntax_and_theme() -> (&'static SyntaxSet, &'static Theme) {
    let ps = SYNTAX_SET.get_or_init(|| SyntaxSet::load_defaults_newlines());
    let theme = HIGHLIGHT_THEME.get_or_init(|| {
        let ts = ThemeSet::load_defaults();
        ts.themes["base16-ocean.dark"].clone()
    });
    (ps, theme)
}

/// A high-performance HTML escaping utility to protect against XSS/RCE injection
/// and prevent characters like `<` or `&` from breaking note layouts.
fn escape_html(s: &str) -> String {
    let mut output = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '<' => output.push_str("&lt;"),
            '>' => output.push_str("&gt;"),
            '&' => output.push_str("&amp;"),
            '"' => output.push_str("&quot;"),
            '\'' => output.push_str("&#x27;"),
            _ => output.push(c),
        }
    }
    output
}

pub fn render_markdown(markdown: &str) -> String {
    // 1. Setup options (CommonMark + GFM additions like tables, task lists, footnotes)
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_STRIKETHROUGH);

    let parser = Parser::new_ext(markdown, options);

    // 2. Load syntect syntax and theme sets
    let (ps, theme) = get_syntax_and_theme();

    // 3. Custom Event Iterator to intercept code blocks and internal links safely
    let mut new_events = Vec::new();
    let mut in_code_block = false;
    let mut code_block_lang = String::new();
    let mut code_block_content = String::new();

    // Outgoing link scanning: we will also search for wiki link patterns `[[Note Title]]` in Text events
    for event in parser {
        match event {
            Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(ref lang))) => {
                in_code_block = true;
                code_block_lang = lang.to_string();
                code_block_content.clear();
            }
            Event::End(TagEnd::CodeBlock) => {
                if in_code_block {
                    in_code_block = false;

                    // Highlight the accumulated code block
                    let syntax = ps
                        .find_syntax_by_token(&code_block_lang)
                        .unwrap_or_else(|| ps.find_syntax_plain_text());
                    let mut h = HighlightLines::new(syntax, theme);

                    let mut highlighted_html = String::new();
                    // Add modern container wrapper for the copy button and language tag
                    highlighted_html.push_str("<div class=\"code-block-wrapper\">");
                    highlighted_html.push_str(&format!(
                        "<div class=\"code-block-header\"><span class=\"code-lang\">{}</span><button class=\"copy-code-btn\" onclick=\"copyCodeToClipboard(this)\">Copy</button></div>",
                        if code_block_lang.is_empty() { "text" } else { &code_block_lang }
                    ));
                    highlighted_html.push_str("<pre class=\"syntect-code\"><code>");

                    for line in syntect::util::LinesWithEndings::from(&code_block_content) {
                        let regions = h.highlight_line(line, &ps).unwrap_or_default();
                        let html_line = styled_line_to_highlighted_html(&regions, IncludeBackground::No).unwrap_or_default();
                        highlighted_html.push_str(&html_line);
                    }

                    highlighted_html.push_str("</code></pre></div>");

                    // Inject the pre-highlighted block as raw HTML event
                    new_events.push(Event::Html(highlighted_html.into()));
                }
            }
            Event::Text(ref text) => {
                if in_code_block {
                    code_block_content.push_str(text);
                } else {
                    // Check for wiki links: [[Target Note]] or [[Target Note|Label]]
                    let raw_text = text.to_string();
                    if raw_text.contains("[[") && raw_text.contains("]]") {
                        let parsed_html = parse_wiki_links(&raw_text);
                        new_events.push(Event::Html(parsed_html.into()));
                    } else {
                        new_events.push(event);
                    }
                }
            }
            Event::Html(ref html) => {
                if !in_code_block {
                    // Escape raw HTML input to completely eliminate XSS/RCE vulnerabilities in Tauri
                    let escaped = escape_html(html);
                    new_events.push(Event::Html(escaped.into()));
                }
            }
            Event::InlineHtml(ref html) => {
                if !in_code_block {
                    // Escape raw inline HTML input to protect note canvas rendering
                    let escaped = escape_html(html);
                    new_events.push(Event::Html(escaped.into()));
                }
            }
            _ => {
                if !in_code_block {
                    new_events.push(event);
                }
            }
        }
    }

    // 4. Render back into standard GFM HTML string
    let mut html_output = String::new();
    html::push_html(&mut html_output, new_events.into_iter());
    html_output
}

/// Helper function to parse wiki links `[[Note Name]]` or `[[Note Name|Display Label]]`
/// into special `<a href="keel://note/Note%20Name" class="internal-link">Label</a>` tags.
/// All output fragments are defensively HTML-escaped to prevent script injections.
fn parse_wiki_links(text: &str) -> String {
    let mut result = String::new();
    let mut remaining = text;

    while let Some(start_idx) = remaining.find("[[") {
        // Push escaped text before the double bracket
        result.push_str(&escape_html(&remaining[..start_idx]));

        let after_start = &remaining[start_idx + 2..];
        if let Some(end_idx) = after_start.find("]]") {
            let inner = &after_start[..end_idx];
            
            // Handle optional display label separator `|`
            let (target, label) = if let Some(pipe_idx) = inner.find('|') {
                (&inner[..pipe_idx], &inner[pipe_idx + 1..])
            } else {
                (inner, inner)
            };

            let trimmed_target = target.trim();
            let trimmed_label = label.trim();
            
            let encoded_target = urlencoding::encode(trimmed_target);
            let escaped_target = escape_html(trimmed_target);
            let escaped_label = escape_html(trimmed_label);

            result.push_str(&format!(
                "<a href=\"keel://note/{}\" class=\"internal-link\" data-target=\"{}\">{}</a>",
                encoded_target, escaped_target, escaped_label
            ));

            remaining = &after_start[end_idx + 2..];
        } else {
            // Unclosed double bracket, push escaped bracket indicator and continue
            result.push_str("&lt;&lt;");
            remaining = after_start;
        }
    }

    result.push_str(&escape_html(remaining));
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wiki_link_parser() {
        let text = "Welcome to [[Architecture Docs]] and check [[Ideas|our ideas page]]!";
        let rendered = parse_wiki_links(text);
        assert!(rendered.contains("href=\"keel://note/Architecture%20Docs\""));
        assert!(rendered.contains("data-target=\"Architecture Docs\""));
        assert!(rendered.contains("our ideas page</a>"));
    }

    #[test]
    fn test_xss_sanitization() {
        let raw = "<script>alert('XSS')</script>";
        let rendered = render_markdown(raw);
        assert!(!rendered.contains("<script>"));
        assert!(rendered.contains("&lt;script&gt;"));
    }

    #[test]
    fn test_wiki_link_escaping() {
        let text = "Check [[Target <script>]] & [[Other|Label <>&'\"]]";
        let rendered = parse_wiki_links(text);
        assert!(rendered.contains("&lt;script&gt;"));
        assert!(rendered.contains("Label &lt;&gt;&amp;&#x27;&quot;"));
    }
}
