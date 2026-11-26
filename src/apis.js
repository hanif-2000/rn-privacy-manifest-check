// Apple's required reason API categories, the symbols that trigger each one,
// and the approved reason codes.
// Source: https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api

export const CATEGORIES = {
  NSPrivacyAccessedAPICategoryFileTimestamp: {
    label: 'File timestamp',
    patterns: [
      [/\bNSFileCreationDate\b/, 'NSFileCreationDate'],
      [/\bNSFileModificationDate\b/, 'NSFileModificationDate'],
      [/\bFileAttributeKey\.creationDate\b|\[\s*\.creationDate\s*\]/, 'FileAttributeKey.creationDate'],
      [/\bFileAttributeKey\.modificationDate\b|\[\s*\.modificationDate\s*\]/, 'FileAttributeKey.modificationDate'],
      [/\bfileModificationDate\b/, 'UIDocument.fileModificationDate'],
      [/\b(NSURLContentModificationDateKey|contentModificationDateKey)\b/, 'contentModificationDateKey'],
      [/\b(NSURLCreationDateKey|creationDateKey)\b/, 'creationDateKey'],
      [/\bgetattrlist\s*\(/, 'getattrlist()'],
      [/\bgetattrlistbulk\s*\(/, 'getattrlistbulk()'],
      [/\bfgetattrlist\s*\(/, 'fgetattrlist()'],
      [/\bgetattrlistat\s*\(/, 'getattrlistat()'],
      [/(?<![\w.])stat\s*\(/, 'stat()'],
      [/\bfstat\s*\(/, 'fstat()'],
      [/\bfstatat\s*\(/, 'fstatat()'],
      [/\blstat\s*\(/, 'lstat()'],
    ],
    reasons: {
      'DDA9.1': 'Display file timestamps to the person using the device (not sent off-device).',
      'C617.1': 'Access timestamps, size or metadata of files inside the app container, app group container or CloudKit container.',
      '3B52.1': 'Access timestamps of files the user specifically granted access to (e.g. via a document picker).',
      '0A2A.1': 'Third-party SDK wrapper around file timestamp APIs, used only when the app calls it (SDKs only).',
    },
    suggested: 'C617.1',
  },
  NSPrivacyAccessedAPICategorySystemBootTime: {
    label: 'System boot time',
    patterns: [
      [/\bsystemUptime\b/, 'ProcessInfo.systemUptime'],
      [/\bmach_absolute_time\s*\(/, 'mach_absolute_time()'],
    ],
    reasons: {
      '35F9.1': 'Measure time elapsed between events within the app, or to enable timers.',
      '8FFB.1': 'Calculate absolute timestamps for events within the app (e.g. UIKit or AVFAudio events).',
      '3D61.1': 'Include boot time in an optional, user-submitted bug report.',
    },
    suggested: '35F9.1',
  },
  NSPrivacyAccessedAPICategoryDiskSpace: {
    label: 'Disk space',
    patterns: [
      [/\b(NSURLVolumeAvailableCapacityKey|volumeAvailableCapacityKey)\b/, 'volumeAvailableCapacityKey'],
      [/\b(NSURLVolumeAvailableCapacityForImportantUsageKey|volumeAvailableCapacityForImportantUsageKey)\b/, 'volumeAvailableCapacityForImportantUsageKey'],
      [/\b(NSURLVolumeAvailableCapacityForOpportunisticUsageKey|volumeAvailableCapacityForOpportunisticUsageKey)\b/, 'volumeAvailableCapacityForOpportunisticUsageKey'],
      [/\b(NSURLVolumeTotalCapacityKey|volumeTotalCapacityKey)\b/, 'volumeTotalCapacityKey'],
      [/\bNSFileSystemFreeSize\b|\bFileAttributeKey\.systemFreeSize\b|\[\s*\.systemFreeSize\s*\]/, 'FileAttributeKey.systemFreeSize'],
      [/\bNSFileSystemSize\b|\bFileAttributeKey\.systemSize\b|\[\s*\.systemSize\s*\]/, 'FileAttributeKey.systemSize'],
      [/\bstatfs\s*\(/, 'statfs()'],
      [/\bstatvfs\s*\(/, 'statvfs()'],
      [/\bfstatfs\s*\(/, 'fstatfs()'],
      [/\bfstatvfs\s*\(/, 'fstatvfs()'],
      [/\bgetattrlist\s*\(/, 'getattrlist()'],
      [/\bfgetattrlist\s*\(/, 'fgetattrlist()'],
      [/\bgetattrlistat\s*\(/, 'getattrlistat()'],
    ],
    reasons: {
      '85F4.1': 'Display disk space information to the person using the device.',
      'E174.1': 'Check there is enough disk space to write files, or delete files when space is low.',
      '7D9E.1': 'Include disk space in an optional, user-submitted bug report.',
      'B728.1': 'Health research app informing participants about low disk space.',
    },
    suggested: 'E174.1',
  },
  NSPrivacyAccessedAPICategoryActiveKeyboards: {
    label: 'Active keyboards',
    patterns: [[/\bactiveInputModes\b/, 'UITextInputMode.activeInputModes']],
    reasons: {
      '3EC4.1': 'The app is a custom keyboard app.',
      '54BD.1': 'Present the correct customised UI for text fields based on the active keyboards.',
    },
    suggested: '54BD.1',
  },
  NSPrivacyAccessedAPICategoryUserDefaults: {
    label: 'User defaults',
    patterns: [[/\b(NS)?UserDefaults\b/, 'UserDefaults']],
    reasons: {
      'CA92.1': 'Read and write information only accessible to the app itself.',
      '1C8F.1': 'Read and write information shared within the same App Group.',
      'C56D.1': 'Third-party SDK wrapper around user defaults, used only when the app calls it (SDKs only).',
      'AC6B.1': 'Read managed app configuration (com.apple.configuration.managed) or set MDM feedback.',
    },
    suggested: 'CA92.1',
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

export function shortName(category) {
  return category.replace('NSPrivacyAccessedAPICategory', '');
}
