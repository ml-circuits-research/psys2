import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('authored demo corpus covers source identities, supported complete labels, chatter and direct tool arguments',()=>{
 execFileSync('python3',['training/sop-bert/tests/test-demo-tool-profile.py'],{stdio:['ignore','pipe','pipe']});
});
