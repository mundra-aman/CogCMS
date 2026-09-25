import Link from 'next/link';
import type { ContentBlock } from '@/lib/whitepaper-content';

export interface WhitepaperArticleData {
  title: string;
  description: string;
  dateFormatted: string;
  author: string;
  authorRole?: string;
  readTime: string;
  tags: string[];
  headline?: string;
  stat1Value?: string;
  stat1Label?: string;
  stat2Value?: string;
  stat2Label?: string;
  blocks: ContentBlock[];
}

function InlineText({ text }: { text: string }) {
  if (!text.includes('**')) return <>{text}</>;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} style={{ fontWeight: 700, color: '#1a1a1a' }}>
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const KEY_PATTERN =
  /^\*\*(Founded|Founders|USP|Funding|Valuation|Key Investors|Notable Customers|Traction|Accolade|Pricing|Target Market|Claimed Results|Funding Source):\*\*\s(.+)$/;

function DefinitionLine({ text }: { text: string }) {
  const m = text.match(KEY_PATTERN);
  if (m) {
    return (
      <div
        style={{
          display: 'flex',
          gap: '10px',
          padding: '6px 0',
          borderBottom: '1px solid rgba(0,0,0,0.04)',
          alignItems: 'flex-start',
        }}
      >
        <span
          style={{
            fontSize: '12.5px',
            fontWeight: 700,
            color: '#FF751F',
            minWidth: '140px',
            flexShrink: 0,
            paddingTop: '1px',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}
        >
          {m[1]}
        </span>
        <span style={{ fontSize: '14px', color: '#333', lineHeight: 1.6 }}>
          <InlineText text={m[2]} />
        </span>
      </div>
    );
  }

  return (
    <p style={{ margin: '6px 0', fontSize: '14.5px', color: '#444', lineHeight: 1.7 }}>
      <InlineText text={text} />
    </p>
  );
}

function Block({ block, idx }: { block: ContentBlock; idx: number }) {
  switch (block.type) {
    case 'h1':
      return (
        <h1
          key={idx}
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
            fontWeight: 800,
            color: '#1a1a1a',
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            margin: '0 0 32px',
          }}
        >
          <InlineText text={block.text!} />
        </h1>
      );

    case 'h2':
      return (
        <div key={idx} style={{ margin: '48px 0 20px' }}>
          <h2
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: '#1a1a1a',
              letterSpacing: '-0.025em',
              lineHeight: 1.25,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '4px',
                height: '22px',
                borderRadius: '2px',
                background: 'linear-gradient(180deg, #FF751F, #ff9044)',
                flexShrink: 0,
              }}
            />
            <InlineText text={block.text!} />
          </h2>
          <div
            style={{
              height: '1px',
              background: 'linear-gradient(90deg, rgba(255,117,31,0.25), transparent)',
              marginTop: '12px',
            }}
          />
        </div>
      );

    case 'h3':
      return (
        <div
          key={idx}
          style={{
            margin: '32px 0 12px',
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(255,117,31,0.06), rgba(255,255,255,0.4))',
            border: '1px solid rgba(255,117,31,0.18)',
            borderRadius: '14px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          }}
        >
          <h3
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#1a1a1a',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            <InlineText text={block.text!} />
          </h3>
        </div>
      );

    case 'divider':
      return (
        <div
          key={idx}
          style={{
            margin: '40px 0',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,117,31,0.3), transparent)',
          }}
        />
      );

    case 'paragraph': {
      const lines = block.text!.split('\n').filter(Boolean);
      const hasDefinitions = lines.some((l) => KEY_PATTERN.test(l));
      if (hasDefinitions) {
        return (
          <div
            key={idx}
            style={{
              margin: '4px 0 16px',
              padding: '2px 0',
            }}
          >
            {lines.map((line, li) => (
              <DefinitionLine key={li} text={line} />
            ))}
          </div>
        );
      }

      return (
        <p
          key={idx}
          style={{
            fontSize: '15px',
            color: '#444',
            lineHeight: 1.8,
            margin: '12px 0',
          }}
        >
          <InlineText text={block.text!.replace(/\n/g, ' ')} />
        </p>
      );
    }

    case 'ul':
      return (
        <ul
          key={idx}
          style={{
            margin: '12px 0 20px',
            paddingLeft: '0',
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {block.items!.map((item, li) => (
            <li
              key={li}
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                fontSize: '14.5px',
                color: '#444',
                lineHeight: 1.7,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#FF751F',
                  flexShrink: 0,
                  marginTop: '9px',
                }}
              />
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol
          key={idx}
          style={{
            margin: '12px 0 20px',
            paddingLeft: '0',
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {block.items!.map((item, li) => (
            <li
              key={li}
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                fontSize: '14.5px',
                color: '#444',
                lineHeight: 1.7,
              }}
            >
              <span
                style={{
                  minWidth: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #FF751F, #ff9044)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {li + 1}
              </span>
              <InlineText text={item} />
            </li>
          ))}
        </ol>
      );

    case 'table':
      return (
        <div
          key={idx}
          style={{
            margin: '24px 0',
            overflowX: 'auto',
            borderRadius: '14px',
            border: '1px solid rgba(255,117,31,0.18)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13.5px',
            }}
          >
            <thead>
              <tr
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,117,31,0.1), rgba(255,117,31,0.05))',
                }}
              >
                {block.headers!.map((h, hi) => (
                  <th
                    key={hi}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: 700,
                      color: '#FF751F',
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                      borderBottom: '1px solid rgba(255,117,31,0.18)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows!.map((row, ri) => (
                <tr
                  key={ri}
                  style={{
                    background: ri % 2 === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,246,234,0.5)',
                    transition: 'background 0.15s',
                  }}
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '11px 16px',
                        color: ci === 0 ? '#1a1a1a' : '#555',
                        fontWeight: ci === 0 ? 600 : 400,
                        borderBottom:
                          ri < block.rows!.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                        whiteSpace: ci <= 1 ? 'nowrap' : undefined,
                      }}
                    >
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}

function MetaItem({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        color: '#555',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function Dot() {
  return (
    <span
      style={{
        width: '4px',
        height: '4px',
        borderRadius: '50%',
        background: '#ccc',
        flexShrink: 0,
      }}
    />
  );
}

export function WhitepaperArticle({ wp }: { wp: WhitepaperArticleData }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #fdfaf7 0%, #f5f0e8 100%)',
        fontFamily: 'var(--font-sans, Geist, sans-serif)',
      }}
    >
      <header
        style={{
          paddingTop: '110px',
          paddingBottom: '48px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            right: '10%',
            width: '500px',
            height: '400px',
            background: 'radial-gradient(ellipse, rgba(255,117,31,0.1) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            maxWidth: '820px',
            margin: '0 auto',
            padding: '0 24px',
            position: 'relative',
          }}
        >
          <Link
            href="/whitepapers"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#FF751F',
              textDecoration: 'none',
              marginBottom: '28px',
              padding: '6px 14px',
              background: 'rgba(255,117,31,0.08)',
              border: '1px solid rgba(255,117,31,0.2)',
              borderRadius: '999px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M9 2L4 7l5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            All Whitepapers
          </Link>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '20px',
            }}
          >
            {wp.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#FF751F',
                  background: 'rgba(255,117,31,0.1)',
                  border: '1px solid rgba(255,117,31,0.25)',
                  borderRadius: '999px',
                  padding: '4px 12px',
                  letterSpacing: '0.03em',
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          <h1
            style={{
              fontSize: 'clamp(1.8rem, 5vw, 3rem)',
              fontWeight: 800,
              color: '#1a1a1a',
              letterSpacing: '-0.035em',
              lineHeight: 1.1,
              marginBottom: '20px',
            }}
          >
            {wp.title}
          </h1>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '20px',
              padding: '14px 20px',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.8), rgba(255,255,255,0.5))',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,117,31,0.15)',
              borderRadius: '14px',
            }}
          >
            <MetaItem icon="✍️" label={wp.author} />
            <Dot />
            <MetaItem icon="📅" label={wp.dateFormatted} />
            <Dot />
            <MetaItem icon="⏱️" label={wp.readTime} />
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: '820px',
          margin: '0 auto',
          padding: '0 24px 96px',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.9), rgba(255,255,255,0.65))',
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            border: '1px solid rgba(255,255,255,0.75)',
            borderRadius: '20px',
            padding: 'clamp(24px, 5vw, 48px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
        >
          {wp.blocks.map((block, idx) => (
            <Block key={idx} block={block} idx={idx} />
          ))}
        </div>

        <div
          style={{
            marginTop: '48px',
            padding: '32px',
            background: 'linear-gradient(135deg, rgba(255,117,31,0.08), rgba(255,117,31,0.03))',
            border: '1px solid rgba(255,117,31,0.2)',
            borderRadius: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
          }}
        >
          <div>
            <p
              style={{
                fontWeight: 700,
                color: '#1a1a1a',
                fontSize: '1.05rem',
                marginBottom: '4px',
              }}
            >
              Public call to action preview
            </p>
            <p style={{ color: '#666', fontSize: '13.5px' }}>
              The selected website owns the final call to action and destination.
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #FF751F, #ff9044)',
              color: 'white',
              fontSize: '14px',
              fontWeight: 700,
              borderRadius: '12px',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 16px rgba(255,117,31,0.3)',
            }}
          >
            Website-controlled
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7h10M7 2l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </main>
    </div>
  );
}
