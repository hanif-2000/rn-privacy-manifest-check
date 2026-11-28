# rn-privacy-manifest-check
---

> ### 💼 Built by Hanif Mohammad — React Native & full-stack developer
> **Top Rated Plus on Upwork · 100% Job Success.** Need a React Native / Expo app built, fixed, or shipped reliably?
>
> **[→ Hire me on Upwork](https://www.upwork.com/freelancers/~01b46f78c173c3ba9b)**  ·  **[→ Portfolio](https://hanif-2000.github.io)**
>
> **🛠 Fix it for me:** got the App Store privacy manifest email? I'll fix your `PrivacyInfo.xcprivacy` at a fixed price (from $99), usually within 48 hours. **[Message me on Upwork](https://www.upwork.com/freelancers/~01b46f78c173c3ba9b)**.
>
> Found this tool useful? Please **⭐ the repo** or **[sponsor on GitHub ❤](https://github.com/sponsors/hanif-2000)** — it keeps these tools maintained.

---

Find which React Native packages use Apple's **required reason APIs** — and check that your app's `PrivacyInfo.xcprivacy` declares them, **before** App Store Connect emails you about it.

```bash
npx rn-privacy-manifest-check
```

- Scans the native iOS code of every npm package with a `.podspec`, plus `ios/Pods`
- Detects all five categories Apple lists: file timestamp, system boot time, disk space, active keyboards and user defaults
- Tells you **which package** uses each API (and, with `--verbose`, the exact file and line)
- Checks your manifest: missing categories, **reason codes that aren't valid for the category**, unknown category names
- Recognises packages that ship their own privacy manifest
- Supports bare React Native (`ios/<App>/PrivacyInfo.xcprivacy`) and Expo (`ios.privacyManifests` in `app.json`)
- `--snippet` prints the XML to paste in; zero dependencies; CI-friendly exit codes and `--json`

## Why

Apple requires apps to declare why they use certain APIs (`UserDefaults`, file timestamps, `mach_absolute_time`, disk space…) in a privacy manifest. In a React Native app most of those calls live inside third-party native modules you never wrote, so when App Store Connect reports a missing API declaration, it's hard to tell which package triggered it or which reason code to use. This tool shows you.

## Example

Real output on a sample project:

```text
rn-privacy-manifest-check · MyApp
manifest: MyApp/ios/MyApp/PrivacyInfo.xcprivacy

✖ MISSING   System boot time NSPrivacyAccessedAPICategorySystemBootTime
        used by: react-native-fast-timer@3.2.0 — mach_absolute_time()
        fix:  add NSPrivacyAccessedAPICategorySystemBootTime with a reason that matches your use, e.g. 35F9.1
              35F9.1: Measure time elapsed between events within the app, or to enable timers.

✖ INVALID   Disk space NSPrivacyAccessedAPICategoryDiskSpace
        declared reasons: C617.1
        not valid for this category: C617.1
        valid codes: 85F4.1, E174.1, 7D9E.1, B728.1
        used by: react-native-device-info@14.1.1 — FileAttributeKey.systemFreeSize

✔ DECLARED  User defaults NSPrivacyAccessedAPICategoryUserDefaults
        declared reasons: CA92.1
        used by: @acme/prefs@3.2.0 — UserDefaults
        used by: react-native-device-info@14.1.1 — UserDefaults

✖ Privacy manifest needs changes: 1 missing, 1 invalid (3 native packages scanned).
```

## Usage

Run it from your project root, after `pod install`:

```bash
npx rn-privacy-manifest-check                 # current directory
npx rn-privacy-manifest-check path/to/app     # another project
npx rn-privacy-manifest-check --verbose       # file:line for every API use
npx rn-privacy-manifest-check --snippet       # XML for the missing categories
```

| Option | Description |
| --- | --- |
| `--manifest <file>` | Use this `PrivacyInfo.xcprivacy` instead of auto-detecting |
| `--no-pods` | Only scan npm packages, not `ios/Pods` |
| `--verbose` | Show file and line for each API use |
| `--snippet` | Print the XML for missing categories, ready to paste |
| `--json` | Machine-readable output |
| `-v`, `--version` / `-h`, `--help` | Version / help |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Every category in use is declared (or covered by the packages' own manifests) |
| `1` | A category is missing, or the manifest has invalid reason codes |
| `2` | Usage error |

### In CI

```yaml
- run: cd ios && pod install
- run: npx rn-privacy-manifest-check
```

### From code

```js
import { checkPrivacyManifest } from 'rn-privacy-manifest-check';

const result = checkPrivacyManifest('.', { pods: true });
console.log(result.ok, result.summary);
```

## Statuses

| Status | Meaning |
| --- | --- |
| `DECLARED` | Used, and declared in your app's manifest with valid reason codes |
| `MISSING` | Used by a package, but not declared anywhere |
| `INVALID` | Declared with a reason code that doesn't belong to that category, no reasons, or an unknown category name |
| `PACKAGES` | Not in your manifest, but every package using it declares it in its own manifest — make sure those manifests end up in your app bundle (or declare it yourself to be safe) |
| `UNUSED` | Declared, but no usage was found in the scanned native code |

## How it works, and its limits

- It reads source files (`.m`, `.mm`, `.swift`, `.h`, `.c`, `.cpp`) of each npm package that has a `.podspec`, and each folder in `ios/Pods`, strips comments, and matches the API names from [Apple's list](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).
- It's a static source scan: it can't see inside precompiled binaries (`.xcframework`), and a symbol may appear in code your app never calls. Use `--verbose` to review each match.
- **Pick reason codes yourself.** The suggested code is the most common one for the category; Apple requires the reason to match how your app actually uses the API.

## License

MIT © [Hanif Mohammad](https://hanif-2000.github.io)
