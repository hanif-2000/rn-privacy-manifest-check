// Tiny XML property-list reader — enough for PrivacyInfo.xcprivacy files.

function decode(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** Parse an XML plist string into plain JS values. */
export function parsePlist(xml) {
  const tokens = xml
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .match(/<\/?[a-zA-Z]+[^>]*>|[^<]+/g) ?? [];
  let i = 0;

  const next = () => {
    while (i < tokens.length && !tokens[i].startsWith('<') && tokens[i].trim() === '') i++;
    return tokens[i++];
  };
  const text = (tag) => {
    let out = '';
    while (i < tokens.length && tokens[i] !== `</${tag}>`) out += tokens[i++];
    i++; // closing tag
    return decode(out.trim());
  };

  function value(tok) {
    const t = tok?.replace(/\s/g, '');
    switch (t) {
      case '<string>': return text('string');
      case '<string/>': return '';
      case '<integer>': return Number(text('integer'));
      case '<real>': return Number(text('real'));
      case '<date>': return text('date');
      case '<data>': return text('data');
      case '<true/>': return true;
      case '<false/>': return false;
      case '<array/>': return [];
      case '<dict/>': return {};
      case '<array>': {
        const arr = [];
        for (let tk = next(); tk && tk.replace(/\s/g, '') !== '</array>'; tk = next()) arr.push(value(tk));
        return arr;
      }
      case '<dict>': {
        const obj = {};
        for (let tk = next(); tk && tk.replace(/\s/g, '') !== '</dict>'; tk = next()) {
          if (tk.replace(/\s/g, '') !== '<key>') throw new Error(`Expected <key> in plist dict, got ${tk}`);
          const key = text('key');
          obj[key] = value(next());
        }
        return obj;
      }
      default:
        throw new Error(`Unsupported plist token: ${tok}`);
    }
  }

  let tok = next();
  if (tok?.replace(/\s/g, '').startsWith('<plist')) tok = next();
  return value(tok);
}

/**
 * Pull the declared categories and reasons out of a privacy manifest object.
 * @returns {Map<string, string[]>}
 */
export function declaredApis(manifest) {
  const map = new Map();
  for (const entry of manifest?.NSPrivacyAccessedAPITypes ?? []) {
    const type = entry?.NSPrivacyAccessedAPIType;
    if (!type) continue;
    const reasons = Array.isArray(entry.NSPrivacyAccessedAPITypeReasons) ? entry.NSPrivacyAccessedAPITypeReasons : [];
    map.set(type, [...(map.get(type) ?? []), ...reasons]);
  }
  return map;
}
