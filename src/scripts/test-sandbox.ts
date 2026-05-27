import 'dotenv/config';
import { runCode } from '../sandbox/runner.js';

// Three assertions over the ErrorReason vocabulary:
//   1. success    → ok + exact stdout match
//   2. infinite   → timeout
//   3. syntax err → runtime_error
// Each prints a one-line PASS/FAIL.

let failed = 0;
function assert(cond: boolean, label: string, detail?: unknown) {
    if (cond) {
        console.log(`PASS  ${label}`);
    } else {
        failed++;
        console.log(`FAIL  ${label}`, detail !== undefined ? '\n      detail:' : '', detail ?? '');
    }
}

async function main() {
    // 1. Success: read three ints, print their sum.
    console.log('\n▶ python success');
    const ok = await runCode({
        language:  'python',
        code:      'print(sum(map(int, input().split())))',
        stdin:     '1 2 3',
        timeoutMs: 5_000,
    });
    assert(ok.errorReason === 'ok',         'errorReason=ok',         ok.errorReason);
    assert(ok.exitCode    === 0,            'exitCode=0',             ok.exitCode);
    assert(ok.stdout.trim() === '6',        'stdout="6"',             JSON.stringify(ok.stdout));

    // 2. Timeout: infinite loop. Use a short timeout so the test isn't slow.
    console.log('\n▶ python timeout');
    const tl = await runCode({
        language:  'python',
        code:      'while True:\n    pass',
        stdin:     '',
        timeoutMs: 1_500,
    });
    assert(tl.errorReason === 'timeout',    'errorReason=timeout',    tl.errorReason);

    // 3. Runtime error: SyntaxError aborts before any output. exitCode ≠ 0.
    console.log('\n▶ python runtime error');
    const re = await runCode({
        language:  'python',
        code:      'def broken(:\n    pass',
        stdin:     '',
        timeoutMs: 5_000,
    });
    assert(re.errorReason === 'runtime_error', 'errorReason=runtime_error', re.errorReason);
    assert(re.exitCode !== 0,                  'exitCode≠0',                re.exitCode);

    // 4. C++ success: read three ints, print their sum.
    console.log('\n▶ cpp success');
    const cppOk = await runCode({
        language:  'cpp',
        code:      '#include <iostream>\nint main(){int a,b,c;std::cin>>a>>b>>c;std::cout<<a+b+c;return 0;}',
        stdin:     '1 2 3',
        timeoutMs: 15_000,
    });
    console.log('  stderr:', JSON.stringify(cppOk.stderr));
    assert(cppOk.errorReason === 'ok',      'cpp errorReason=ok',  cppOk.errorReason);
    assert(cppOk.exitCode    === 0,         'cpp exitCode=0',      cppOk.exitCode);
    assert(cppOk.stdout.trim() === '6',     'cpp stdout="6"',      JSON.stringify(cppOk.stdout));

    // 5. C++ compile error: missing semicolon. Sentinel exit code 70.
    console.log('\n▶ cpp compile error');
    const cppCe = await runCode({
        language:  'cpp',
        code:      'int main(){ return 0 }',
        stdin:     '',
        timeoutMs: 15_000,
    });
    assert(cppCe.errorReason === 'compile_error', 'cpp errorReason=compile_error', cppCe.errorReason);

    // 6. C++ runtime error: non-zero exit code without compile failure.
    console.log('\n▶ cpp runtime error');
    const cppRe = await runCode({
        language:  'cpp',
        code:      'int main(){ return 1; }',
        stdin:     '',
        timeoutMs: 15_000,
    });
    assert(cppRe.errorReason === 'runtime_error', 'cpp errorReason=runtime_error', cppRe.errorReason);
    assert(cppRe.exitCode === 1,                  'cpp exitCode=1',                cppRe.exitCode);

    console.log(`\n${failed === 0 ? '✅ all assertions passed' : `❌ ${failed} assertion(s) failed`}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error('Harness crashed:', err);
    process.exit(1);
});
