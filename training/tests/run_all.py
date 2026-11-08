"""Runs every training/tests/test_*.py without pytest: each module's test_* functions are called."""
import importlib.util, pathlib, sys

here = pathlib.Path(__file__).resolve().parent
n = 0
for f in sorted(here.glob("test_*.py")):
    spec = importlib.util.spec_from_file_location(f.stem, f); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    for k, v in sorted(vars(m).items()):
        if k.startswith("test_") and callable(v):
            v(); n += 1
print(n, "python tests passed")
