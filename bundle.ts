// bundle.ts
import { Glob } from 'bun';
import { DOMAINS, DomainName } from './bundle.config';

// Получаем домен из аргументов командной строки (по умолчанию 'all')
const domainArg = (process.argv[2] || 'all') as DomainName;

if (!DOMAINS[domainArg]) {
  console.error(`❌ Ошибка: Неизвестный домен "${domainArg}".`);
  console.log(`📌 Доступные домены: ${Object.keys(DOMAINS).join(', ')}`);
  process.exit(1);
}

const patterns = DOMAINS[domainArg];
const ignoreList = ['dist', 'node_modules', 'public', '.git', 'for_gemini'];
const collectedFiles = new Set<string>();

// 1. Всегда принудительно добавляем корневые файлы бандлера, если они существуют
const rootFilesToAlwaysInclude = ['bundle.config.ts', 'bundle.ts'];
for (const rootFile of rootFilesToAlwaysInclude) {
  if (await Bun.file(rootFile).exists()) {
    collectedFiles.add(rootFile);
  }
}

// 2. Сканируем файлы по всем паттернам выбранного домена
for (const pattern of patterns) {
  const glob = new Glob(pattern);
  for (const file of glob.scanSync('.')) {
    const normalizedFile = file.replace(/\\/g, '/');

    const shouldIgnore = ignoreList.some((ignore) => normalizedFile.includes(ignore));
    if (shouldIgnore) continue;

    if (normalizedFile.endsWith('.ts') || normalizedFile.endsWith('.tsx')) {
      collectedFiles.add(normalizedFile);
    }
  }
}

let result = '';
let count = 0;

// Сортируем файлы в алфавитном порядке для стабильного порядка в бандле
const sortedFiles = Array.from(collectedFiles).sort();

for (const file of sortedFiles) {
  const content = await Bun.file(file).text();
  result += `\n\n--- FILE: ${file} ---\n\n${content}`;
  count++;
}

const outputPath = `for_gemini/code_${domainArg}.txt`;
await Bun.write(outputPath, result);

console.log(`🎯 Домен: [${domainArg}]`);
console.log(`📦 Собрано файлов: ${count} -> ${outputPath}`);
