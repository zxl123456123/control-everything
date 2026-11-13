import unittest
from control_everything.integrations.github_push_review import review_push

A, B = 'a' * 40, 'b' * 40

class PushReviewTests(unittest.TestCase):
    def test_uses_fixed_diff_and_renders_only_evidenced_findings(self):
        calls=[]
        def get(path):
            calls.append(path)
            return {'commits':[{'sha':B,'commit':{'message':'fix: make task updates visible\n\nPrivate implementation detail'}}],'merge_base_commit':{'sha':A},'total_commits':1,
                    'files':[{'filename':'src/a.py','patch':'@@ -1 +1 @@\n-old\n+new','status':'modified'}]}
        def model(data):
            self.assertIn('+new',data['files'][0]['patch'])
            self.assertEqual(data['commit_titles'],['fix: make task updates visible'])
            return {'summary':'改进任务状态更新。','findings':[{'path':'src/a.py','line':1,'issue':'缺少失败处理'}]}
        text=review_push('example/repo',A,B,get,model)
        self.assertEqual(calls,[f'compare/{A}...{B}'])
        self.assertIn('改进任务',text)
        self.assertIn('/blob/'+B+'/src/a.py#L1',text)

    def test_partial_scope_is_explicit_and_invented_file_is_rejected(self):
        data={'commits':[{'sha':B}],'merge_base_commit':{'sha':A},'total_commits':1,
              'files':[{'filename':'a.png','status':'modified'}]}
        with self.assertRaises(ValueError):
            review_push('example/repo',A,B,lambda p:data,lambda d:{'summary':'ok','findings':[]})
        data['files'][0].update(filename='a.py',patch='@@ -1 +1 @@\n-a\n+b')
        with self.assertRaises(ValueError):
            review_push('example/repo',A,B,lambda p:data,lambda d:{'summary':'ok','findings':[{'path':'other.py','line':1,'issue':'bug'}]})

    def test_new_branch_analyzes_head_only_and_diverged_compare_fails(self):
        data={'sha':B,'commit':{'message':'feat: show task progress'},'files':[{'filename':'a.py','patch':'@@ -1 +1 @@\n-a\n+b'}]}
        def model(request):
            self.assertEqual(request['commit_titles'],['feat: show task progress'])
            return {'summary':'更新','findings':[]}
        result=review_push('example/repo','0'*40,B,lambda p:data,model)
        self.assertIn('仅分析分支头提交',result)
        with self.assertRaises(ValueError):
            review_push('example/repo',A,B,lambda p:{'head_commit':{'sha':B},'merge_base_commit':{'sha':B}},lambda d:None)
