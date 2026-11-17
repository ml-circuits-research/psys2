"""Tiny CPU head only: no pretrained model, checkpoint, or file weights."""
import copy
import importlib.util
from pathlib import Path
import unittest
import torch
spec=importlib.util.spec_from_file_location('candidate',Path(__file__).with_name('train-key-reader.py'))
train=importlib.util.module_from_spec(spec);spec.loader.exec_module(train)

class CompactedEvaluationTests(unittest.TestCase):
    def head(self):
        model=torch.nn.Linear(2,2)
        with torch.no_grad():
            model.weight.copy_(torch.tensor([[1.0001,0.],[1.0002,-.00005]]))
            model.bias.zero_()
        return model

    def evaluate(self,model):
        prediction=int(model(torch.ones(1,2)).argmax(-1)[0])
        correct=int(prediction==1)
        return {'prediction':prediction,'positiveBioAndGlobalExact':correct,'positiveBioAndGlobalSupport':1,
                'targetTypePresentClass':{'correct':correct,'support':1},'decodedMentionF1':.7}

    def test_selection_uses_compacted_class_and_exact_saved_snapshot(self):
        model=self.head();live=self.evaluate(model)
        evaluated,snapshot=train.evaluate_compacted_checkpoint(model,self.evaluate)
        self.assertEqual(live['prediction'],1)
        self.assertEqual(evaluated['prediction'],0)
        self.assertLess(train.selection_rank(evaluated),train.selection_rank(live))
        reloaded=self.head();reloaded.load_state_dict(snapshot)
        self.assertEqual(self.evaluate(reloaded),evaluated)
        for key,value in model.state_dict().items():
            self.assertEqual(snapshot[key].dtype,torch.bfloat16)
            self.assertTrue(torch.equal(snapshot[key],value.detach().to(torch.bfloat16)))
            self.assertNotEqual(snapshot[key].data_ptr(),value.data_ptr())

    def test_training_parameters_gradients_mode_and_optimizer_unchanged(self):
        model=self.head();model.train()
        optimizer=torch.optim.AdamW(model.parameters())
        for value in model.parameters():
            value.grad=torch.ones_like(value)
            optimizer.state[value]={'step':torch.tensor(2.),'exp_avg':torch.full_like(value,.3),
                                    'exp_avg_sq':torch.full_like(value,.4)}
        before={key:value.clone()for key,value in model.state_dict().items()}
        gradients=[value.grad.clone()for value in model.parameters()]
        state=copy.deepcopy(optimizer.state_dict())
        def inspect(detached):
            self.assertFalse(detached.training)
            self.assertTrue(all(not value.requires_grad for value in detached.parameters()))
            return self.evaluate(detached)
        train.evaluate_compacted_checkpoint(model,inspect)
        self.assertTrue(model.training)
        for key,value in model.state_dict().items():self.assertTrue(torch.equal(value,before[key]))
        for value,gradient in zip(model.parameters(),gradients):self.assertTrue(torch.equal(value.grad,gradient))
        after=optimizer.state_dict()
        self.assertEqual(after['param_groups'],state['param_groups'])
        for key,values in state['state'].items():
            for field,value in values.items():self.assertTrue(torch.equal(after['state'][key][field],value))

    def test_nonfinite_compaction_and_unrecorded_dtype_refuse(self):
        model=self.head()
        with torch.no_grad():model.weight[0,0]=torch.finfo(torch.float32).max
        with self.assertRaisesRegex(ValueError,'nonfinite-compacted'):
            train.evaluate_compacted_checkpoint(model,self.evaluate)
        with self.assertRaisesRegex(ValueError,'unsupported-training-parameter-dtype'):
            train.evaluate_compacted_checkpoint(self.head().double(),self.evaluate)

if __name__=='__main__':unittest.main()
