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

    def test_context_removed_and_unshown_lines_cannot_be_cited(self):
        patches = [
            ('@@ -8,3 +8,3 @@\n unchanged\n-old\n+new\n tail', 8),
            ('@@ -8,3 +8,3 @@\n unchanged\n-old\n+new\n tail', 10),
            ('@@ -8,2 +8,0 @@\n-old\n-other', 8),
            ('@@ -8,2 +8,0 @@\n-old\n-other', 9),
            ('@@ -8 +8,2 @@\n+visible\n+' + 'x' * 2100, 9),
        ]
        for patch, line in patches:
            with self.subTest(line=line, patch=patch[:40]):
                data = {'commits': [{'sha': B}], 'merge_base_commit': {'sha': A},
                        'files': [{'filename': 'a.py', 'patch': patch}]}
                with self.assertRaisesRegex(ValueError, 'review_finding_location_invalid'):
                    review_push('example/repo', A, B, lambda p: data, lambda d: {
                        'summary': '更新', 'findings': [{'path': 'a.py', 'line': line, 'issue': 'bug'}]})

    def test_numbers_new_lines_across_hunks_without_counting_deletions(self):
        patch = '@@ -8,3 +8,3 @@\n context\n-old\n+new\n tail\n@@ -20,0 +21,2 @@\n+first\n+second\n\\ No newline at end of file'
        data = {'commits': [{'sha': B}], 'merge_base_commit': {'sha': A},
                'files': [{'filename': 'a.py', 'patch': patch}]}
        def model(request):
            file = request['files'][0]
            self.assertIn('8  context', file['patch'])
            self.assertIn('9 +new', file['patch'])
            self.assertIn('21 +first', file['patch'])
            self.assertIn('22 +second', file['patch'])
            self.assertNotIn('added_lines', file)
            return {'summary': '更新', 'findings': [{'path': 'a.py', 'line': 22, 'issue': 'bug'}]}
        self.assertIn('#L22', review_push('example/repo', A, B, lambda p: data, model))

    def test_complete_lines_and_coverage_are_supplied_within_existing_budget(self):
        data = {'commits': [{'sha': B}], 'merge_base_commit': {'sha': A}, 'files': [
            {'filename': 'a.py', 'patch': '@@ -1 +1,2 @@\n+visible\n+' + 'x' * 2100},
            {'filename': 'binary.png'},
        ]}
        def model(request):
            file = request['files'][0]
            self.assertNotIn('xxxx', file['patch'])
            self.assertIn('1 +visible', file['patch'])
            self.assertNotIn('added_lines', file)
            self.assertEqual(request['coverage'], {'head_only': False, 'partial': True,
                'changed_files': 2, 'analyzed_files': 1})
            self.assertLessEqual(len(file['patch']), 2000)
            return {'summary': '更新', 'findings': []}
        self.assertIn('部分文本差异', review_push('example/repo', A, B, lambda p: data, model))

    def test_pure_deletion_can_be_summarized_without_new_line_findings(self):
        data = {'commits': [{'sha': B}], 'merge_base_commit': {'sha': A},
                'files': [{'filename': 'a.py', 'patch': '@@ -1,2 +0,0 @@\n-old\n-other', 'status': 'removed'}]}
        def model(request):
            self.assertNotIn('added_lines', request['files'][0])
            self.assertIn('-old', request['files'][0]['patch'])
            return {'summary': '删除旧实现。', 'findings': []}
        text = review_push('example/repo', A, B, lambda p: data, model)
        self.assertIn('删除旧实现', text)
        self.assertIn('简评不覆盖删除引入的问题', text)

    def test_total_numbered_diff_stays_within_budget(self):
        patch = '@@ -1,100 +1,100 @@\n' + '\n'.join('+' + 'x' * 30 for _ in range(100))
        data = {'commits': [{'sha': B}], 'merge_base_commit': {'sha': A},
                'files': [{'filename': f'src/{i}.py', 'patch': patch} for i in range(8)]}
        def model(request):
            self.assertLessEqual(sum(len(f['patch']) for f in request['files']), 8000)
            self.assertTrue(all(len(f['patch']) <= 2000 for f in request['files']))
            self.assertTrue(request['coverage']['partial'])
            return {'summary': '更新', 'findings': []}
        self.assertIn('部分文本差异', review_push('example/repo', A, B, lambda p: data, model))

    def test_fragments_without_changes_do_not_consume_file_slots(self):
        for oversized in ('@@ -0,0 +1 @@\n+', '@@ -1 +1 @@\n ', '@@ -1 +0,0 @@\n-'):
            with self.subTest(prefix=oversized):
                data = {'commits': [{'sha': B}], 'merge_base_commit': {'sha': A},
                        'files': [{'filename': f'src/large{i}.py', 'patch': oversized + 'x' * 2100}
                                  for i in range(20)] + [
                            {'filename': 'src/small.py', 'patch': '@@ -1 +1 @@\n-old\n+new'}]}
                def model(request):
                    self.assertEqual([f['path'] for f in request['files']], ['src/small.py'])
                    self.assertEqual(request['coverage']['analyzed_files'], 1)
                    self.assertTrue(request['coverage']['partial'])
                    return {'summary': '更新', 'findings': [
                        {'path': 'src/small.py', 'line': 1, 'issue': 'bug'}]}
                self.assertIn('#L1', review_push('example/repo', A, B, lambda p: data, model))

    def test_header_only_diff_does_not_invoke_model(self):
        data = {'commits': [{'sha': B}], 'merge_base_commit': {'sha': A},
                'files': [{'filename': 'large.py', 'patch': '@@ -0,0 +1 @@\n+' + 'x' * 2100}]}
        def model(request):
            self.fail('model must not summarize a hunk header without changed code')
        with self.assertRaisesRegex(ValueError, 'review_no_text_diff'):
            review_push('example/repo', A, B, lambda p: data, model)
