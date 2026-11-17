"""Pure stopping-state fixtures; no model, dataset, checkpoint, or GPU."""
import copy
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('candidate',Path(__file__).with_name('train-key-reader.py'))
train=importlib.util.module_from_spec(spec);spec.loader.exec_module(train)

def report(correct,support=10,f1=.8,type_correct=8):
    return {'positiveBioAndGlobalExact':correct,'positiveBioAndGlobalSupport':support,
            'decodedMentionF1':f1,'targetTypePresentClass':{'correct':type_correct,'support':10}}

class PlateauTests(unittest.TestCase):
    def progress(self,values,policy=None):
        policy=policy or train.training_policy();state=None;states=[]
        for epoch,value in enumerate(values,1):
            state=train.advance_plateau(state,epoch,report(value),policy);states.append(state)
            if state['stopReason']:break
        return states

    def test_defaults_and_finite_constraints(self):
        p=train.training_policy()
        self.assertEqual((p['minEpochs'],p['patience'],p['maxEpochs']),(3,3,30))
        for args in [(2,3,30),(3,0,30),(5,3,4),(3,3,1001),(True,3,30)]:
            with self.assertRaises(ValueError):train.training_policy(*args)

    def test_improvements_reset_patience(self):
        states=self.progress([5,5,4,6,6,6,7])
        self.assertEqual([s['badEpochs']for s in states],[0,1,2,0,1,2,0])
        self.assertIsNone(states[-1]['stopReason'])

    def test_ties_plateau_with_actual_epoch_not_max(self):
        state=self.progress([5]*20)[-1]
        self.assertEqual(state['epoch'],4)
        self.assertEqual(state['stopReason'],'primary-plateau')
        self.assertEqual(state['bestPrimaryCorrect'],5)
        self.assertFalse(state['maxReached'])

    def test_regressions_count_as_non_improvements(self):
        state=self.progress([8,7,6,5])[-1]
        self.assertEqual(state['stopReason'],'primary-plateau')
        self.assertEqual(state['badEpochs'],3)

    def test_minimum_epochs_even_when_patience_already_exhausted(self):
        states=self.progress([5]*10,train.training_policy(5,1,20))
        self.assertEqual(len(states),5)
        self.assertTrue(states[-1]['minimumSatisfied'])
        self.assertEqual(states[-1]['stopReason'],'primary-plateau')

    def test_cap_when_improving(self):
        states=self.progress([1,2,3,4,5,6],train.training_policy(3,3,5))
        self.assertEqual(len(states),5)
        self.assertEqual(states[-1]['stopReason'],'max-epochs')
        self.assertTrue(states[-1]['primaryImproved'])

    def test_secondary_selection_improvement_does_not_reset_primary_patience(self):
        p=train.training_policy();state=None;previous_rank=None
        for epoch in range(1,5):
            result=report(5,f1=.1*epoch,type_correct=epoch)
            rank=train.selection_rank(result)
            if previous_rank:self.assertGreater(rank,previous_rank)
            state=train.advance_plateau(state,epoch,result,p);previous_rank=rank
        self.assertEqual(state['stopReason'],'primary-plateau')
        self.assertEqual(state['badEpochs'],3)

    def test_state_immutable_and_gaps_changed_support_finished_refuse(self):
        p=train.training_policy();first=train.advance_plateau(None,1,report(5),p);before=copy.deepcopy(first)
        train.advance_plateau(first,2,report(6),p)
        self.assertEqual(first,before)
        for epoch,r in [(3,report(6)),(2,report(6,11))]:
            with self.assertRaises(ValueError):train.advance_plateau(first,epoch,r,p)
        finished=self.progress([5]*4)[-1]
        with self.assertRaises(ValueError):train.advance_plateau(finished,5,report(6),p)

    def test_no_positive_or_malformed_counts_refuse(self):
        for r in [report(0,0),report(11),report(-1),report(True)]:
            with self.assertRaises(ValueError):train.advance_plateau(None,1,r,train.training_policy())

if __name__=='__main__':unittest.main()
