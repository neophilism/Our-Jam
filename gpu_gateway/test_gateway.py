import json
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
import unittest
from urllib import request, error
from http.server import ThreadingHTTPServer

from gpu_gateway.server import Gateway,make_handler,JobStore
from gpu_gateway.runners import RunnerError,validate_job

TOKEN="private-test-token-that-exceeds-32-characters"
ENV={"GPU_GATEWAY_TOKEN":TOKEN,"HEARTMULA_CHECKPOINT_APPROVED":"1",
     "MUSICGEN_NONCOMMERCIAL_RESEARCH_APPROVED":"1","STABLE_AUDIO_OPEN_LICENSE_APPROVED":"1"}

def job(engine="heartmula",model="HeartMuLa-oss-3B",purpose="commercial_evaluation",seconds=25):
    return {"engine":engine,"model":model,"purpose":purpose,"description":"Funky instrumental drums and lively horns",
            "durationSeconds":seconds,"instrumental":True,"outputs":1}

class GatewayTests(unittest.TestCase):
    def test_rejects_wrong_license_model_and_noncommercial(self):
        validate_job(**{"engine":"heartmula","model":"HeartMuLa-oss-3B","purpose":"commercial_evaluation",
                        "prompt":"Jazz drums and bass","duration_seconds":25,"env":ENV})
        with self.assertRaisesRegex(RunnerError,"noncommercial"):
            validate_job("musicgen","facebook/musicgen-small","commercial_evaluation","Instrumental electro jazz",25,ENV)
        with self.assertRaisesRegex(RunnerError,"30_seconds"):
            validate_job("musicgen","facebook/musicgen-small","private_research","Instrumental electro jazz",60,ENV)
        with self.assertRaisesRegex(RunnerError,"unapproved"):
            validate_job("heartmula","heartmula-other","private_research","Instrumental electro jazz",30,ENV)
        with self.assertRaisesRegex(RunnerError,"license"):
            validate_job("stable_audio_open","stable-audio-3-medium","commercial_evaluation","Instrumental electro jazz",25,
                         {**ENV,"STABLE_AUDIO_OPEN_LICENSE_APPROVED":"0"})
    def test_durable_one_output_and_restart_unknown_state(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            calls=[]
            def fake_runner(engine,model,purpose,prompt,duration,workdir,output,env):
                calls.append(engine)
                output.parent.mkdir(parents=True,exist_ok=True)
                output.write_bytes(b"x"*1200)
                return 0.125
            gw=Gateway(root,ENV,runner=fake_runner)
            identifier=gw.submit(job())
            self.assertEqual(gw.store.get(identifier)["state"],"queued")
            self.assertTrue(gw.step())
            self.assertFalse(gw.step())
            self.assertEqual(calls,["heartmula"])
            self.assertEqual(gw.store.get(identifier)["state"],"succeeded")
            self.assertTrue((root/"results"/(identifier+".mp3")).is_file())
            future=gw.submit(job())
            with gw.store.connect() as conn:
                conn.execute("UPDATE jobs SET state='running' WHERE id=?",(future,))
            restarted=Gateway(root,ENV,runner=fake_runner)
            self.assertEqual(restarted.store.get(future)["state"],"unknown")
            self.assertFalse(restarted.step())
            self.assertEqual(calls,["heartmula"],"ambiguous task must not be blindly regenerated")
    def test_auth_limits_and_endpoint_response_shapes(self):
        with TemporaryDirectory() as tmp:
            def fake(*args):
                output=args[6]
                output.write_bytes(b"A"*1200)
                return 0.2
            gw=Gateway(Path(tmp),ENV,runner=fake)
            server=ThreadingHTTPServer(("127.0.0.1",0),make_handler(gw))
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            root="http://127.0.0.1:"+str(server.server_port)
            def call(method,path,data=None,auth=True):
                headers={"Content-Type":"application/json"}
                if auth:headers["Authorization"]="Bearer "+TOKEN
                req=request.Request(root+path,data=json.dumps(data).encode("utf-8") if data is not None else None,
                                    headers=headers,method=method)
                return request.urlopen(req,timeout=4)
            try:
                with self.assertRaises(error.HTTPError) as exc:
                    call("POST","/v1/jobs",job(),auth=False)
                self.assertEqual(exc.exception.code,401)
                with self.assertRaises(error.HTTPError) as exc:
                    call("POST","/v1/jobs",{**job(),"outputs":2})
                self.assertEqual(exc.exception.code,400)
                with call("POST","/v1/jobs",job()) as response:
                    self.assertEqual(response.status,202)
                    job_id=json.loads(response.read())["id"]
                with call("GET","/v1/jobs/"+job_id) as response:
                    state=json.loads(response.read())
                    self.assertEqual(state["state"],"queued")
                    self.assertEqual(state["engine"],"heartmula")
                gw.step()
                with call("GET","/v1/jobs/"+job_id) as response:
                    state=json.loads(response.read())
                    self.assertEqual(state["state"],"succeeded")
                    self.assertEqual(state["contentType"],"audio/mpeg")
                with call("GET","/v1/jobs/"+job_id+"/audio") as response:
                    self.assertEqual(response.headers["Content-Type"],"audio/mpeg")
                    self.assertEqual(len(response.read()),1200)
                with self.assertRaises(error.HTTPError) as exc:
                    call("GET","/v1/jobs/../../etc/passwd/audio")
                self.assertEqual(exc.exception.code,404)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)

if __name__=="__main__":unittest.main()
